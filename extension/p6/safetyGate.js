import { resolveTarget }
  from "./targetResolver.js";

import { classifyRisk }
  from "./riskyActionRules.js";

import {
  isSensitive,
  getSensitiveType
} from "./sensitiveRegistry.js";

const SUPPORTED_ACTIONS = new Set([
  "click",
  "type",
  "scroll",
  "navigate",
  "wait"
]);

/**
 * Check whether a navigation URL is allowed.
 *
 * Only normal HTTP(S) navigation is permitted.
 */
function isAllowedNavigationUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsedUrl =
      new URL(
        url,
        window.location.href
      );

    return (
      parsedUrl.protocol === "http:" ||
      parsedUrl.protocol === "https:"
    );
  } catch {
    return false;
  }
}

/**
 * Main P6 safety decision.
 *
 * Possible decisions:
 *
 * EXECUTE
 * CONFIRM
 * BLOCK
 *
 * confirmationGranted is an internal one-shot authorization.
 *
 * Even when confirmationGranted === true:
 * - the target is resolved again
 * - P3 sensitivity is checked again
 * - visibility is checked again
 * - disabled state is checked again
 * - covered state is checked again
 *
 * Only the already-satisfied confirmation requirement is bypassed.
 */
export function evaluateAction(
  agentAction,
  {
    confirmationGranted = false
  } = {}
) {
  // --------------------------------------------------
  // 0. Validate action object
  // --------------------------------------------------
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
    target_id,
    metadata
  } = agentAction;

  // --------------------------------------------------
  // 1. Validate action type
  // --------------------------------------------------
  if (
    typeof action !== "string" ||
    !SUPPORTED_ACTIONS.has(action)
  ) {
    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "UNSUPPORTED_ACTION"
    };
  }

  // --------------------------------------------------
  // 2. Validate metadata
  // --------------------------------------------------
  if (
    metadata !== undefined &&
    (
      metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    )
  ) {
    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "INVALID_METADATA"
    };
  }

  const actionMetadata =
    metadata || {};

  // --------------------------------------------------
  // 3. Actions that do not require a DOM target
  // --------------------------------------------------
  if (!target_id) {

    // Navigation changes the browser destination.
    if (action === "navigate") {
      const url =
        actionMetadata.url;

      if (!url) {
        return {
          decision: "BLOCK",
          status: "INVALID_ACTION",
          element: null,
          reason: "NAVIGATION_URL_REQUIRED"
        };
      }

      if (!isAllowedNavigationUrl(url)) {
        return {
          decision: "BLOCK",
          status: "UNSAFE_NAVIGATION_BLOCKED",
          element: null,
          reason: "NAVIGATION_URL_SCHEME_NOT_ALLOWED"
        };
      }

      if (confirmationGranted) {
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
        reason: "NAVIGATION_REQUIRES_CONFIRMATION"
      };
    }

    // Scroll and wait are the only actions allowed
    // without a DOM target.
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

    // Click/type without a target is always invalid.
    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "TARGET_ID_REQUIRED"
    };
  }

  // --------------------------------------------------
  // 4. Validate target ID
  // --------------------------------------------------
  if (typeof target_id !== "string") {
    return {
      decision: "BLOCK",
      status: "INVALID_ACTION",
      element: null,
      reason: "TARGET_ID_MUST_BE_STRING"
    };
  }

  // --------------------------------------------------
  // 5. Resolve target
  // --------------------------------------------------
  //
  // This is deliberately performed every time evaluateAction
  // is called. Confirmation approval must never reuse the
  // element from the first evaluation.
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
  // 6. P3 HARD VETO
  // --------------------------------------------------
  //
  // This happens AFTER fresh target resolution and on
  // EVERY evaluation, including post-confirmation.
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

  // --------------------------------------------------
  // 7. Risk classification
  // --------------------------------------------------
  const risk =
    classifyRisk(
      agentAction,
      resolution.element
    );

  // --------------------------------------------------
  // 8. Confirmation requirement
  // --------------------------------------------------
  if (risk === "CONFIRM") {

    // A previous user confirmation only satisfies
    // the confirmation requirement for THIS invocation.
    //
    // Fresh target and P3 checks above still apply.
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

  // --------------------------------------------------
  // 9. Safe action
  // --------------------------------------------------
  return {
    decision: "EXECUTE",
    status: "TARGET_RESOLVED",
    element: resolution.element,
    reason: null
  };
}