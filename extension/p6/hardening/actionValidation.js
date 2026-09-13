/**
 * P6 Action Boundary Validation
 *
 * This validates the shape of P5's response before it reaches
 * safety classification.
 *
 * It does NOT decide whether an action is risky.
 * That remains the responsibility of safetyGate.js.
 */

import {
  SECURITY_POLICY,
  isSupportedAction
} from "./securityPolicy.js";


function invalid(
  reason
) {
  return {
    valid: false,
    reason
  };
}


function valid() {
  return {
    valid: true,
    reason: null
  };
}


export function validateAgentAction(
  action
) {
  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action)
  ) {
    return invalid(
      "ACTION_OBJECT_REQUIRED"
    );
  }


  if (
    !isSupportedAction(
      action.action
    )
  ) {
    return invalid(
      "UNSUPPORTED_ACTION"
    );
  }


  if (
    action.target_id !== null &&
    action.target_id !== undefined &&
    typeof action.target_id !== "string"
  ) {
    return invalid(
      "INVALID_TARGET_ID"
    );
  }


  if (
    action.confidence !== undefined &&
    (
      typeof action.confidence !== "number" ||
      !Number.isFinite(
        action.confidence
      ) ||
      action.confidence < 0 ||
      action.confidence > 1
    )
  ) {
    return invalid(
      "INVALID_CONFIDENCE"
    );
  }


  if (
    action.metadata !== undefined &&
    (
      action.metadata === null ||
      typeof action.metadata !== "object" ||
      Array.isArray(action.metadata)
    )
  ) {
    return invalid(
      "INVALID_METADATA"
    );
  }


  const metadata =
    action.metadata || {};


  if (
    action.action === "navigate"
  ) {

    if (
      action.target_id !== null &&
      action.target_id !== undefined
    ) {
      return invalid(
        "NAVIGATION_TARGET_ID_FORBIDDEN"
      );
    }


    if (
      typeof metadata.url !== "string" ||
      !metadata.url.trim()
    ) {
      return invalid(
        "NAVIGATION_URL_REQUIRED"
      );
    }
  }


  if (
    action.action === "type" &&
    action.target_id === null
  ) {
    return invalid(
      "TYPE_TARGET_REQUIRED"
    );
  }


  if (
    action.action === "click" &&
    action.target_id === null
  ) {
    return invalid(
      "CLICK_TARGET_REQUIRED"
    );
  }


  return valid();
}


export function assertValidAgentAction(
  action
) {
  const result =
    validateAgentAction(
      action
    );

  if (!result.valid) {
    throw new Error(
      result.reason
    );
  }

  return action;
}