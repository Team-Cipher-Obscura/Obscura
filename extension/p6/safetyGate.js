import {
  validateAgentAction
} from "./hardening/actionValidation.js";

import {
  isAllowedProtocol
} from "./hardening/securityPolicy.js";

import {
  resolveTarget
} from "./targetResolver.js";

import {
  isSensitiveTarget
} from "./sensitiveRegistry.js";

import {
  classifyRisk
} from "./riskyActionRules.js";

import {
  createExecutionResult
} from "./executionResult.js";

import {
  logSafetyEvent
} from "./logger.js";

function validationReason(validation) {
  if (
    !validation ||
    !Array.isArray(validation.errors) ||
    validation.errors.length === 0
  ) {
    return "ACTION_VALIDATION_FAILED";
  }

  return validation.errors.join(", ");
}

function blocked(action, reason) {
  return createExecutionResult({
    status: "BLOCKED",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    reason
  });
}

function confirmationPending(action, reason) {
  return createExecutionResult({
    status: "CONFIRMATION_PENDING",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    reason
  });
}

function safe(action, element = null) {
  return {
    status: "SAFE",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    element
  };
}

function getSensitiveType(targetId) {
  if (!targetId) {
    return null;
  }

  if (
    typeof isSensitiveTarget === "function"
  ) {
    const result = isSensitiveTarget(targetId);

    if (result === true) {
      return "sensitive";
    }

    if (
      result &&
      typeof result === "object"
    ) {
      return (
        result.type ??
        result.reason ??
        "sensitive"
      );
    }

    if (typeof result === "string") {
      return result;
    }
  }

  return null;
}

function getNavigationUrl(action) {
  return action?.metadata?.url ?? null;
}

function validateNavigationProtocol(action) {
  if (action.action !== "navigate") {
    return true;
  }

  const url = getNavigationUrl(action);

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return isAllowedProtocol(
      parsed.protocol
    );
  } catch {
    return false;
  }
}

/**
 * Evaluate an agent action without executing it.
 *
 * confirmationGranted is intentionally passed only by the confirmation
 * approval path after a fresh safety evaluation is requested.
 */
export function evaluateAction(
  agentAction,
  {
    confirmationGranted = false
  } = {}
) {
  const validation =
    validateAgentAction(agentAction);

  if (!validation.valid) {
    const reason =
      validationReason(validation);

    logSafetyEvent(
      "ACTION_BLOCKED",
      {
        action: agentAction?.action ?? null,
        target_id:
          agentAction?.target_id ?? null,
        reason
      }
    );

    return blocked(
      agentAction,
      reason
    );
  }

  /*
   * Navigation protocol enforcement is centralized through the shared
   * security policy.
   */
  if (
    agentAction.action === "navigate" &&
    !validateNavigationProtocol(agentAction)
  ) {
    const reason =
      "UNSAFE_NAVIGATION_BLOCKED";

    logSafetyEvent(
      "ACTION_BLOCKED",
      {
        action: agentAction.action,
        target_id:
          agentAction.target_id ?? null,
        reason
      }
    );

    return blocked(
      agentAction,
      reason
    );
  }

  /*
   * Navigate actions do not resolve DOM targets.
   */
  let element = null;

  if (agentAction.action !== "navigate") {
    const resolution =
      resolveTarget(agentAction.target_id);

    if (!resolution) {
      const reason =
        "TARGET_NOT_FOUND";

      logSafetyEvent(
        "ACTION_BLOCKED",
        {
          action: agentAction.action,
          target_id:
            agentAction.target_id ?? null,
          reason
        }
      );

      return blocked(
        agentAction,
        reason
      );
    }

    element =
      resolution.element ??
      resolution;

    if (!element) {
      const reason =
        "TARGET_NOT_FOUND";

      logSafetyEvent(
        "ACTION_BLOCKED",
        {
          action: agentAction.action,
          target_id:
            agentAction.target_id ?? null,
          reason
        }
      );

      return blocked(
        agentAction,
        reason
      );
    }

    /*
     * P3 sensitive state always wins over every other classification.
     */
    const sensitiveType =
      getSensitiveType(
        agentAction.target_id
      );

    if (sensitiveType) {
      const reason =
        `P3_SENSITIVE_TARGET:${sensitiveType}`;

      logSafetyEvent(
        "ACTION_BLOCKED",
        {
          action: agentAction.action,
          target_id:
            agentAction.target_id ?? null,
          reason
        }
      );

      return blocked(
        agentAction,
        reason
      );
    }
  }

  const risk =
    classifyRisk(
      agentAction,
      element
    );

  /*
   * Risk classifiers may return either a string or an object depending on
   * the rule implementation.
   */
  const riskLevel =
    typeof risk === "string"
      ? risk
      : risk?.level ??
        risk?.risk ??
        risk?.classification ??
        "safe";

  const normalizedRisk =
    String(riskLevel).toLowerCase();

  if (
    normalizedRisk === "block" ||
    normalizedRisk === "blocked" ||
    normalizedRisk === "high"
  ) {
    const reason =
      typeof risk === "object"
        ? (
            risk.reason ??
            risk.code ??
            "RISK_BLOCKED"
          )
        : "RISK_BLOCKED";

    logSafetyEvent(
      "ACTION_BLOCKED",
      {
        action: agentAction.action,
        target_id:
          agentAction.target_id ?? null,
        reason
      }
    );

    return blocked(
      agentAction,
      reason
    );
  }

  if (
    (
      normalizedRisk === "confirm" ||
      normalizedRisk === "confirmation" ||
      normalizedRisk === "confirmation_required"
    ) &&
    !confirmationGranted
  ) {
    const reason =
      typeof risk === "object"
        ? (
            risk.reason ??
            risk.code ??
            "CONFIRMATION_REQUIRED"
          )
        : "CONFIRMATION_REQUIRED";

    logSafetyEvent(
      "CONFIRMATION_REQUIRED",
      {
        action: agentAction.action,
        target_id:
          agentAction.target_id ?? null,
        reason
      }
    );

    return {
      ...confirmationPending(
        agentAction,
        reason
      ),
      element
    };
  }

  return safe(
    agentAction,
    element
  );
}