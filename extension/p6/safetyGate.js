import { resolveTarget }
  from "./targetResolver.js";

import { classifyRisk }
  from "./riskyActionRules.js";

import {
  isSensitive,
  getSensitiveType
} from "./sensitiveRegistry.js";

import { isAllowedProtocol }
  from "./hardening/securityPolicy.js";

import { validateAgentAction }
  from "./hardening/actionValidation.js";

import { logger }
  from "./hardening/logger.js";


/**
 * P6 Safety Gate
 *
 * Safety flow:
 *
 *   validate
 *       ↓
 *   navigation protocol check
 *       ↓
 *   target resolution
 *       ↓
 *   P3 sensitive hard veto
 *       ↓
 *   risk classification
 *       ↓
 *   EXECUTE / CONFIRM / BLOCK
 *
 * Possible decisions:
 *
 *   EXECUTE
 *   CONFIRM
 *   BLOCK
 *
 * The `confirmationGranted` option is used only after the user has
 * explicitly approved a confirmation request. Even then, the complete
 * safety evaluation is repeated with a fresh target resolution and
 * fresh P3 sensitive state.
 */
export function evaluateAction(
  agentAction,
  {
    confirmationGranted = false
  } = {}
) {

  // --------------------------------------------------
  // 0. STRUCTURAL VALIDATION
  // --------------------------------------------------

  const validation =
    validateAgentAction(agentAction);

  if (!validation.valid) {

    const reason =
      Array.isArray(validation.errors) &&
      validation.errors.length > 0
        ? validation.errors.join(", ")
        : "ACTION_VALIDATION_FAILED";

    logger.warn(
      "P6 action blocked during validation",
      {
        action:
          agentAction?.action ?? null,
        target_id:
          agentAction?.target_id ?? null,
        reason
      }
    );

    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason
    };
  }


  const {
    action,
    target_id
  } = agentAction;


  // --------------------------------------------------
  // 1. ACTIONS THAT DO NOT REQUIRE A DOM TARGET
  // --------------------------------------------------

  if (!target_id) {

    // Navigation does not target a DOM element,
    // but it changes the browser destination.
    if (action === "navigate") {

      const url =
        agentAction?.metadata?.url;

      let allowed = false;

      if (
        typeof url === "string" &&
        url.trim()
      ) {
        try {
          const parsedUrl =
            new URL(url);

          allowed =
            isAllowedProtocol(
              parsedUrl.protocol
            );
        } catch {
          allowed = false;
        }
      }

      if (!allowed) {

        logger.warn(
          "P6 navigation blocked",
          {
            action,
            target_id: null,
            reason: "UNSAFE_NAVIGATION_BLOCKED"
          }
        );

        return {
          decision: "BLOCK",
          status: "UNSAFE_NAVIGATION_BLOCKED",
          element: null,
          reason: "UNSAFE_NAVIGATION_BLOCKED"
        };
      }

      /*
       * Navigation remains a confirmation-required action.
       *
       * On the post-approval recheck, confirmationGranted allows
       * the already-approved navigation to proceed.
       */
      if (!confirmationGranted) {

        logger.info(
          "P6 navigation requires confirmation",
          {
            action,
            target_id: null
          }
        );

        return {
          decision: "CONFIRM",
          status: "CONFIRMATION_REQUIRED",
          element: null,
          reason:
            "NAVIGATION_REQUIRES_CONFIRMATION"
        };
      }

      return {
        decision: "EXECUTE",
        status: "NO_TARGET_ACTION",
        element: null,
        reason: null
      };
    }


    // Scroll and wait are the only other actions
    // allowed to operate without a DOM target.
    if (
      action === "scroll" ||
      action === "wait" ||
      action === "done"
    ) {

      return {
        decision: "EXECUTE",
        status: "NO_TARGET_ACTION",
        element: null,
        reason: null
      };
    }


    // Click/type without a target is invalid.
    // Never execute it.
    logger.warn(
      "P6 action missing target_id",
      {
        action,
        target_id: null,
        reason: "TARGET_ID_REQUIRED"
      }
    );

    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "TARGET_ID_REQUIRED"
    };
  }


  // --------------------------------------------------
  // 2. RESOLVE THE CURRENT TARGET
  // --------------------------------------------------

  const resolution =
    resolveTarget(target_id);


  /*
   * IMPORTANT:
   *
   * resolveTarget() always returns an object:
   *
   * {
   *   success,
   *   status,
   *   element
   * }
   *
   * Do NOT do:
   *
   *   resolution.element ?? resolution
   *
   * because a failed resolution has element === null and
   * would therefore incorrectly assign the entire resolution
   * object as the "element".
   */
  if (
    !resolution ||
    resolution.success !== true
  ) {

    const reason =
      resolution?.status ||
      "TARGET_COULD_NOT_BE_RESOLVED";

    logger.warn(
      "P6 target resolution failed",
      {
        action,
        target_id,
        reason
      }
    );

    return {
      decision: "BLOCK",
      status:
        resolution?.status ||
        "TARGET_COULD_NOT_BE_RESOLVED",
      element: null,
      reason
    };
  }


  const element =
    resolution.element;


  /*
   * A successful resolver result is required to contain
   * an actual DOM element.
   */
  if (!element) {

    logger.warn(
      "P6 resolver returned no element",
      {
        action,
        target_id,
        reason: "TARGET_COULD_NOT_BE_RESOLVED"
      }
    );

    return {
      decision: "BLOCK",
      status: "TARGET_COULD_NOT_BE_RESOLVED",
      element: null,
      reason: "TARGET_COULD_NOT_BE_RESOLVED"
    };
  }


  // --------------------------------------------------
  // 3. P3 HARD VETO
  // --------------------------------------------------

  /*
   * P3 sensitive state always wins.
   *
   * This check happens after fresh target resolution and
   * before risky-action classification.
   */
  if (isSensitive(target_id)) {

    const sensitiveType =
      getSensitiveType(target_id) ||
      "unknown";

    const reason =
      `P3 flagged target as sensitive: ${sensitiveType}`;

    logger.warn(
      "P6 action blocked by P3 sensitive registry",
      {
        action,
        target_id,
        reason
      }
    );

    return {
      decision: "BLOCK",
      status: "SENSITIVE_ELEMENT_BLOCKED",
      element,
      reason
    };
  }


  // --------------------------------------------------
  // 4. RISK CLASSIFICATION
  // --------------------------------------------------

  const risk =
    classifyRisk(
      agentAction,
      element
    );


  // --------------------------------------------------
  // 5. CONFIRMATION REQUIRED
  // --------------------------------------------------

  if (
    risk === "CONFIRM" &&
    !confirmationGranted
  ) {

    logger.info(
      "P6 risky action requires confirmation",
      {
        action,
        target_id
      }
    );

    return {
      decision: "CONFIRM",
      status: "CONFIRMATION_REQUIRED",
      element,
      reason: "RISKY_ACTION"
    };
  }


  // --------------------------------------------------
  // 6. SAFE / CONFIRMED ACTION
  // --------------------------------------------------

  /*
   * If confirmationGranted === true, this is the result of
   * the complete fresh safety recheck after approval.
   *
   * The fresh target and fresh P3 state have already been
   * checked above.
   */
  logger.debug(
    "P6 action passed safety gate",
    {
      action,
      target_id,
      confirmationGranted
    }
  );

  return {
    decision: "EXECUTE",
    status: "TARGET_RESOLVED",
    element,
    reason: null
  };
}