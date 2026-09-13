import {
  isSupportedAction
} from "./securityPolicy.js";

/**
 * Structural validation only.
 *
 * This function does not resolve DOM targets, inspect sensitive elements,
 * classify risk, or execute anything.
 *
 * Contract:
 * {
 *   valid: boolean,
 *   errors: string[]
 * }
 */
export function validateAgentAction(action) {
  const errors = [];

  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action)
  ) {
    return {
      valid: false,
      errors: ["ACTION_NOT_OBJECT"]
    };
  }

  if (!isSupportedAction(action.action)) {
    errors.push("UNSUPPORTED_ACTION");
  }

  if (
    action.confidence !== undefined &&
    (
      typeof action.confidence !== "number" ||
      !Number.isFinite(action.confidence) ||
      action.confidence < 0 ||
      action.confidence > 1
    )
  ) {
    errors.push("INVALID_CONFIDENCE");
  }

  if (
    action.metadata !== undefined &&
    (
      !action.metadata ||
      typeof action.metadata !== "object" ||
      Array.isArray(action.metadata)
    )
  ) {
    errors.push("INVALID_METADATA");
  }

  /*
   * Navigation is URL-driven and must not carry a DOM target.
   */
  if (action.action === "navigate") {
    if (
      action.target_id !== undefined &&
      action.target_id !== null
    ) {
      errors.push(
        "NAVIGATE_TARGET_ID_NOT_ALLOWED"
      );
    }

    if (
      !action.metadata ||
      typeof action.metadata.url !== "string" ||
      !action.metadata.url.trim()
    ) {
      errors.push("NAVIGATION_URL_MISSING");
    }
  }

  /*
   * DOM actions require a target id.
   */
  if (
    action.action === "click" ||
    action.action === "type"
  ) {
    if (
      typeof action.target_id !== "string" ||
      !action.target_id.trim()
    ) {
      errors.push("TARGET_ID_REQUIRED");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}