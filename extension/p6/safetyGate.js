import {
  resolveTarget
} from "./targetResolver.js";

import {
  classifyRisk
} from "./riskyActionRules.js";

import {
  isSensitive,
  getSensitiveType
} from "./sensitiveRegistry.js";

import {
  validateAgentAction
} from "./hardening/actionValidation.js";

import {
  logger
} from "./hardening/logger.js";

import {
  isAllowedProtocol
} from "./hardening/securityPolicy.js";


export const SUPPORTED_ACTIONS =
  new Set([
    "click",
    "type",
    "scroll",
    "navigate",
    "wait"
  ]);


export function isAllowedNavigationUrl(
  url
) {
  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    return false;
  }

  try {

    const parsed =
      new URL(
        url,
        window.location.href
      );

    return isAllowedProtocol(
      parsed.protocol
    );

  } catch {
    return false;
  }
}


function isValidMetadata(
  metadata
) {
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
  );
}


function blockResult({
  action = null,
  target_id = null,
  status,
  reason,
  element = null
}) {
  return {
    decision: "BLOCK",
    status,
    element,
    reason,
    action,
    target_id
  };
}


export function evaluateAction(
  agentAction,
  {
    confirmationGranted = false
  } = {}
) {

  const validation =
    validateAgentAction(
      agentAction
    );


  if (!validation.valid) {

    logger.warn(
      "action_validation_blocked",
      {
        reason:
          validation.reason,

        action:
          logger.sanitizeAction(
            agentAction
          )
      }
    );

    return blockResult({
      action:
        agentAction?.action ?? null,

      target_id:
        agentAction?.target_id ?? null,

      status:
        validation.reason,

      reason:
        validation.reason
    });
  }


  const {
    action,
    target_id,
    metadata
  } = agentAction;


  logger.action(
    "safety_evaluation_started",
    agentAction,
    {
      confirmationGranted:
        Boolean(
          confirmationGranted
        )
    }
  );


  // --------------------------------------------------
  // Navigation policy
  // --------------------------------------------------

  if (action === "navigate") {

    if (
      target_id !== null &&
      target_id !== undefined
    ) {
      logger.warn(
        "navigation_target_id_blocked",
        {
          target_id
        }
      );

      return blockResult({
        action,
        target_id,
        status:
          "INVALID_ACTION",
        reason:
          "Navigate actions must not include a target_id."
      });
    }


    const url =
      metadata.url;


    if (
      typeof url !== "string" ||
      !url.trim()
    ) {
      return blockResult({
        action,
        target_id: null,
        status:
          "NAVIGATION_URL_REQUIRED",
        reason:
          "Navigation URL is required."
      });
    }


    if (
      !isAllowedNavigationUrl(
        url
      )
    ) {

      logger.warn(
        "unsafe_navigation_blocked",
        {
          action,
          protocol:
            (() => {
              try {
                return new URL(
                  url,
                  window.location.href
                ).protocol;
              } catch {
                return "invalid";
              }
            })()
        }
      );

      return blockResult({
        action,
        target_id: null,
        status:
          "UNSAFE_NAVIGATION_BLOCKED",
        reason:
          "Navigation URL scheme is not allowed."
      });
    }
  }


  // --------------------------------------------------
  // Targetless actions
  // --------------------------------------------------

  if (!target_id) {

    if (action === "navigate") {

      if (
        confirmationGranted
      ) {
        logger.info(
          "navigation_confirmation_granted"
        );

        return {
          decision: "EXECUTE",
          status:
            "CONFIRMATION_GRANTED",
          element: null,
          reason: null
        };
      }


      return {
        decision: "CONFIRM",
        status:
          "CONFIRMATION_REQUIRED",
        element: null,
        reason:
          "NAVIGATION_REQUIRES_CONFIRMATION"
      };
    }


    if (
      action === "scroll" ||
      action === "wait"
    ) {
      return {
        decision: "EXECUTE",
        status:
          "NO_TARGET_ACTION",
        element: null,
        reason: null
      };
    }


    return blockResult({
      action,
      target_id: null,
      status:
        "INVALID_ACTION",
      reason:
        "TARGET_ID_REQUIRED"
    });
  }


  // --------------------------------------------------
  // Fresh target resolution
  // --------------------------------------------------

  const resolutionStartedAt =
    performance.now();

  const resolution =
    resolveTarget(
      target_id
    );

  const resolutionDuration =
    performance.now() -
    resolutionStartedAt;


  logger.debug(
    "target_resolution_completed",
    {
      target_id,
      success:
        Boolean(
          resolution.success
        ),
      status:
        resolution.status,
      duration_ms:
        Number(
          resolutionDuration.toFixed(3)
        )
    }
  );


  if (!resolution.success) {
    return blockResult({
      action,
      target_id,
      status:
        resolution.status,
      reason:
        "TARGET_COULD_NOT_BE_RESOLVED"
    });
  }


  // --------------------------------------------------
  // P3 hard veto
  // --------------------------------------------------

  if (
    isSensitive(
      target_id
    )
  ) {

    const sensitiveType =
      getSensitiveType(
        target_id
      );

    logger.warn(
      "p3_sensitive_target_blocked",
      {
        target_id,
        sensitive_type:
          sensitiveType || "unknown"
      }
    );

    return blockResult({
      action,
      target_id,
      status:
        "SENSITIVE_ELEMENT_BLOCKED",
      element:
        resolution.element,
      reason:
        `P3 flagged target as sensitive: ${
          sensitiveType || "unknown"
        }`
    });
  }


  // --------------------------------------------------
  // Risk classification
  // --------------------------------------------------

  const riskStartedAt =
    performance.now();

  const risk =
    classifyRisk(
      agentAction,
      resolution.element
    );

  const riskDuration =
    performance.now() -
    riskStartedAt;


  logger.debug(
    "risk_classification_completed",
    {
      action,
      target_id,
      risk,
      duration_ms:
        Number(
          riskDuration.toFixed(3)
        )
    }
  );


  // --------------------------------------------------
  // Confirmation
  // --------------------------------------------------

  if (
    risk === "CONFIRM"
  ) {

    if (
      confirmationGranted
    ) {

      logger.info(
        "confirmation_recheck_approved",
        {
          action,
          target_id
        }
      );

      return {
        decision: "EXECUTE",
        status:
          "CONFIRMATION_GRANTED",
        element:
          resolution.element,
        reason: null
      };
    }


    logger.info(
      "confirmation_required",
      {
        action,
        target_id
      }
    );

    return {
      decision: "CONFIRM",
      status:
        "CONFIRMATION_REQUIRED",
      element:
        resolution.element,
      reason:
        "RISKY_ACTION"
    };
  }


  logger.info(
    "safe_action_approved",
    {
      action,
      target_id
    }
  );


  return {
    decision: "EXECUTE",
    status:
      "TARGET_RESOLVED",
    element:
      resolution.element,
    reason: null
  };
}