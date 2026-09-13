import { resolveTarget }
  from "./targetResolver.js";

import { classifyRisk }
  from "./riskyActionRules.js";

import {
  isSensitive,
  getSensitiveType
} from "./sensitiveRegistry.js";


/**
 * P5 is only allowed to emit these action types.
 *
 * Do not add semantic actions such as:
 * delete | purchase | submit | pay
 *
 * Those are represented by the risk of a resolved DOM target,
 * not by the action type itself.
 */
export const SUPPORTED_ACTIONS = new Set([
  "click",
  "type",
  "scroll",
  "navigate",
  "wait"
]);


/**
 * Navigation is deliberately restricted to HTTP(S).
 *
 * This is a safety-gate check, not merely an executor check.
 * The executor has its own defense-in-depth validation too.
 */
export function isAllowedNavigationUrl(url) {
  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
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
 * Metadata must be an object.
 *
 * null, arrays, strings, numbers, booleans, etc.
 * are not valid P5 metadata.
 */
function isValidMetadata(metadata) {
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
  );
}


/**
 * Standard safety-gate BLOCK result.
 */
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


/**
 * Main P6 safety decision.
 *
 * Possible decisions:
 *
 * EXECUTE
 * CONFIRM
 * BLOCK
 *
 * Phase 4 confirmation flow calls this gate again with:
 *
 *   { confirmationGranted: true }
 *
 * That second evaluation is still performed from scratch:
 * - action validation
 * - metadata validation
 * - navigation validation
 * - target resolution
 * - P3 sensitive check
 * - risk classification
 *
 * The confirmation flag only means the user has already approved
 * the previously classified risky action. It does NOT bypass safety.
 */
export function evaluateAction(
  agentAction,
  {
    confirmationGranted = false
  } = {}
) {

  // --------------------------------------------------
  // 0. Basic action-object validation
  // --------------------------------------------------

  if (
    !agentAction ||
    typeof agentAction !== "object" ||
    Array.isArray(agentAction)
  ) {
    return blockResult({
      status: "INVALID_ACTION",
      reason: "ACTION_OBJECT_REQUIRED"
    });
  }


  const {
    action,
    target_id,
    metadata
  } = agentAction;


  // --------------------------------------------------
  // 1. Action-type allowlist
  // --------------------------------------------------

  if (
    typeof action !== "string" ||
    !SUPPORTED_ACTIONS.has(action)
  ) {
    return blockResult({
      action:
        typeof action === "string"
          ? action
          : null,
      target_id:
        typeof target_id === "string"
          ? target_id
          : null,
      status: "UNSUPPORTED_ACTION",
      reason:
        `Unsupported action type: ${String(action)}`
    });
  }


  // --------------------------------------------------
  // 2. Metadata shape validation
  // --------------------------------------------------

  if (!isValidMetadata(metadata)) {
    return blockResult({
      action,
      target_id:
        typeof target_id === "string"
          ? target_id
          : null,
      status: "INVALID_METADATA",
      reason: "ACTION_METADATA_MUST_BE_AN_OBJECT"
    });
  }


  // --------------------------------------------------
  // 3. Navigation-specific validation
  //
  // IMPORTANT:
  // This happens BEFORE confirmation.
  //
  // Therefore javascript:, data:, file:, ftp:, malformed
  // and missing URLs are BLOCKED immediately rather than
  // presented to the user for approval.
  // --------------------------------------------------

  if (action === "navigate") {

    const url = metadata.url;


    if (
      typeof url !== "string" ||
      !url.trim()
    ) {
      return blockResult({
        action,
        target_id: null,
        status: "NAVIGATION_URL_REQUIRED",
        reason: "Navigation URL is required."
      });
    }


    if (!isAllowedNavigationUrl(url)) {
      return blockResult({
        action,
        target_id: null,
        status: "UNSAFE_NAVIGATION_BLOCKED",
        reason:
          "Navigation URL scheme is not allowed."
      });
    }
  }


  // --------------------------------------------------
  // 4. Actions that do not require a DOM target
  // --------------------------------------------------

  if (!target_id) {

    // Navigation has already passed its URL validation.
    //
    // It changes browser destination, so it requires
    // confirmation unless the caller is performing the
    // second, post-approval safety evaluation.
    if (action === "navigate") {

      if (confirmationGranted) {
        return {
          decision: "EXECUTE",
          status: "NO_TARGET_ACTION",
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


    // These actions are explicitly allowed without a target.
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


    // click/type require a DOM target.
    return blockResult({
      action,
      target_id: null,
      status: "INVALID_ACTION",
      reason: "TARGET_ID_REQUIRED"
    });
  }


  // --------------------------------------------------
  // 5. Resolve the current live target
  //
  // This is deliberately performed every time evaluateAction()
  // is called. Phase 4 therefore gets fresh target resolution
  // after confirmation.
  // --------------------------------------------------

  const resolution =
    resolveTarget(target_id);


  if (!resolution.success) {
    return blockResult({
      action,
      target_id,
      status: resolution.status,
      reason: "TARGET_COULD_NOT_BE_RESOLVED"
    });
  }


  // --------------------------------------------------
  // 6. P3 HARD VETO
  //
  // This always wins, including after confirmation.
  // --------------------------------------------------

  if (isSensitive(target_id)) {
    return blockResult({
      action,
      target_id,
      status: "SENSITIVE_ELEMENT_BLOCKED",
      element: resolution.element,
      reason:
        `P3 flagged target as sensitive: ${
          getSensitiveType(target_id) || "unknown"
        }`
    });
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
  // 8. Confirmation required
  //
  // On the initial evaluation:
  //   risky action -> CONFIRM
  //
  // On the post-approval evaluation:
  //   risky action + confirmationGranted -> EXECUTE
  //
  // Importantly, confirmationGranted does NOT skip any
  // validation above.
  // --------------------------------------------------

  if (risk === "CONFIRM") {

    if (confirmationGranted) {
      return {
        decision: "EXECUTE",
        status: "CONFIRMATION_GRANTED",
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