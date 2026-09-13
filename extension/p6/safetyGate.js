import { resolveTarget }
  from "./targetResolver.js";

import { classifyRisk }
  from "./riskyActionRules.js";

import {
  isSensitive,
  getSensitiveType
} from "./sensitiveRegistry.js";


/**
 * Main P6 safety decision.
 *
 * Possible decisions:
 *
 * EXECUTE
 * CONFIRM
 * BLOCK
 *
 * confirmationGranted is ONLY used after the user has
 * explicitly approved a confirmation request.
 *
 * It does NOT bypass:
 * - target resolution
 * - visibility checks
 * - disabled checks
 * - covered-target checks
 * - P3 sensitive checks
 * - action/risk classification
 *
 * Therefore a post-confirmation evaluation is still a
 * complete fresh safety evaluation.
 */
export function evaluateAction(
  agentAction,
  {
    confirmationGranted = false
  } = {}
) {

  // -----------------------------------------
  // 0. Validate action object
  // -----------------------------------------

  if (
    !agentAction ||
    typeof agentAction !== "object" ||
    Array.isArray(agentAction)
  ) {
    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "ACTION_OBJECT_REQUIRED"
    };
  }


  const {
    action,
    target_id
  } = agentAction;


  // -----------------------------------------
  // 1. Actions without DOM targets
  // -----------------------------------------

  if (!target_id) {

    // Navigation changes browser destination and
    // therefore always requires confirmation.
    if (action === "navigate") {

      if (
        confirmationGranted
      ) {
        return {
          decision: "EXECUTE",
          status: "CONFIRMED_NAVIGATION",
          element: null,
          reason: null
        };
      }

      return {
        decision: "CONFIRM",
        status: "CONFIRMATION_REQUIRED",
        element: null,
        reason:
          "NAVIGATION_REQUIRES_CONFIRMATION"
      };
    }


    // Scroll and wait are allowed without a target.
    if (
      action === "scroll" ||
      action === "wait"
    ) {
      return {
        decision: "EXECUTE",
        status: "NO_TARGET_ACTION",
        element: null,
        reason: null
      };
    }


    // Click/type without a target are invalid.
    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "TARGET_ID_REQUIRED"
    };
  }


  // -----------------------------------------
  // 2. Resolve target FRESH
  // -----------------------------------------

  const resolution =
    resolveTarget(target_id);


  if (!resolution.success) {
    return {
      decision: "BLOCK",
      status: resolution.status,
      element: null,
      reason:
        "TARGET_COULD_NOT_BE_RESOLVED"
    };
  }


  // -----------------------------------------
  // 3. P3 HARD VETO
  // -----------------------------------------
  //
  // This check happens EVERY time this function
  // is called, including after confirmation.
  //
  // Therefore a P3 update made while the confirmation
  // dialog is open wins over a previous approval.
  //

  if (isSensitive(target_id)) {
    return {
      decision: "BLOCK",
      status: "SENSITIVE_ELEMENT_BLOCKED",
      element: resolution.element,
      reason:
        `P3 flagged target as sensitive: ${
          getSensitiveType(target_id) ||
          "unknown"
        }`
    };
  }


  // -----------------------------------------
  // 4. Risk classification
  // -----------------------------------------

  const risk =
    classifyRisk(
      agentAction,
      resolution.element
    );


  // -----------------------------------------
  // 5. Confirmation
  // -----------------------------------------

  if (risk === "CONFIRM") {

    // A user approval satisfies only the
    // confirmation requirement.
    //
    // All checks above have still been performed
    // against the current page state.
    if (confirmationGranted) {
      return {
        decision: "EXECUTE",
        status: "CONFIRMED_ACTION",
        element: resolution.element,
        reason: null
      };
    }

    return {
      decision: "CONFIRM",
      status: "CONFIRMATION_REQUIRED",
      element: resolution.element,
      reason: "RISKY_ACTION"
    };
  }


  // -----------------------------------------
  // 6. SAFE
  // -----------------------------------------

  return {
    decision: "EXECUTE",
    status: "TARGET_RESOLVED",
    element: resolution.element,
    reason: null
  };
}