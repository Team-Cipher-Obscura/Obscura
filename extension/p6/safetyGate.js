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
 */
export function evaluateAction(agentAction) {

  const {
    action,
    target_id
  } = agentAction;


  // --------------------------------------------------
  // 1. Actions that do not require a DOM target
  // --------------------------------------------------

  if (!target_id) {

    // Navigation changes the browser destination,
    // so it requires user confirmation.
    if (action === "navigate") {

      return {
        decision: "CONFIRM",
        status: "CONFIRMATION_REQUIRED",
        element: null,
        reason: "NAVIGATION_REQUIRES_CONFIRMATION"
      };
    }

    // wait / scroll can proceed without target resolution
    // for the current MVP.
    return {
      decision: "EXECUTE",
      status: "NO_TARGET_ACTION",
      element: null,
      reason: null
    };
  }


  // --------------------------------------------------
  // 2. Resolve the target
  // --------------------------------------------------

  const resolution =
    resolveTarget(target_id);

  if (!resolution.success) {

    return {
      decision: "BLOCK",
      status: resolution.status,
      element: null,
      reason: "TARGET_COULD_NOT_BE_RESOLVED"
    };
  }


  // --------------------------------------------------
  // 3. P3 HARD VETO
  // --------------------------------------------------

  if (isSensitive(target_id)) {

    return {
      decision: "BLOCK",
      status: "SENSITIVE_ELEMENT_BLOCKED",
      element: resolution.element,
      reason:
        `P3 flagged target as sensitive: ${
          getSensitiveType(target_id) || "unknown"
        }`
    };
  }


  // --------------------------------------------------
  // 4. Risk classification
  // --------------------------------------------------

  const risk =
    classifyRisk(
      agentAction,
      resolution.element
    );


  // --------------------------------------------------
  // 5. Confirmation required
  // --------------------------------------------------

  if (risk === "CONFIRM") {

    return {
      decision: "CONFIRM",
      status: "CONFIRMATION_REQUIRED",
      element: resolution.element,
      reason: "RISKY_ACTION"
    };
  }


  // --------------------------------------------------
  // 6. Safe action
  // --------------------------------------------------

  return {
    decision: "EXECUTE",
    status: "TARGET_RESOLVED",
    element: resolution.element,
    reason: null
  };
}