import {
  isSupportedAction
} from "./securityPolicy.js";


/**
 * Validate the structural shape of a P5 AgentResponse.
 *
 * This function is intentionally non-throwing.
 *
 * safetyGate.js is the authoritative caller and decides
 * whether the invalid action becomes a BLOCK result.
 */
export function validateAgentAction(
  action
) {
  const errors = [];


  /*
   * ---------------------------------------------
   * Top-level object
   * ---------------------------------------------
   */

  if (
    !action ||
    typeof action !== "object" ||
    Array.isArray(action)
  ) {
    return {
      valid: false,

      errors: [
        "ACTION_MUST_BE_OBJECT"
      ]
    };
  }


  /*
   * ---------------------------------------------
   * Action type
   * ---------------------------------------------
   */

  if (
    typeof action.action !== "string" ||
    action.action.trim() === ""
  ) {
    errors.push(
      "ACTION_TYPE_REQUIRED"
    );
  } else if (
    !isSupportedAction(
      action.action
    )
  ) {
    errors.push(
      "UNSUPPORTED_ACTION"
    );
  }


  /*
   * ---------------------------------------------
   * target_id
   *
   * P5 uses:
   *
   *   string target_id
   *   null target_id
   *
   * Empty strings are not valid targets.
   * ---------------------------------------------
   */

  if (
    action.target_id !== null &&
    action.target_id !== undefined &&
    (
      typeof action.target_id !== "string" ||
      action.target_id.trim() === ""
    )
  ) {
    errors.push(
      "INVALID_TARGET_ID"
    );
  }


  /*
   * ---------------------------------------------
   * confidence
   * ---------------------------------------------
   */

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
    errors.push(
      "INVALID_CONFIDENCE"
    );
  }


  /*
   * ---------------------------------------------
   * metadata
   *
   * metadata must be a plain object when supplied.
   * ---------------------------------------------
   */

  if (
    action.metadata !== undefined &&
    (
      action.metadata === null ||
      typeof action.metadata !== "object" ||
      Array.isArray(action.metadata)
    )
  ) {
    errors.push(
      "INVALID_METADATA"
    );
  }


  /*
   * ---------------------------------------------
   * Navigation-specific shape
   * ---------------------------------------------
   */

  if (
    action.action === "navigate"
  ) {
    /*
     * Navigation actions must not carry a DOM target.
     *
     * The safety gate also enforces this as a hard safety
     * condition. Keeping the structural validation here
     * makes malformed navigation actions fail early.
     */
    if (
      action.target_id !== null &&
      action.target_id !== undefined
    ) {
      errors.push(
        "NAVIGATE_TARGET_ID_NOT_ALLOWED"
      );
    }


    const url =
      action.metadata?.url;


    if (
      typeof url !== "string" ||
      url.trim() === ""
    ) {
      errors.push(
        "NAVIGATION_URL_REQUIRED"
      );
    }
  }


  /*
   * ---------------------------------------------
   * Target-required actions
   * ---------------------------------------------
   */

  if (
    (
      action.action === "click" ||
      action.action === "type"
    ) &&
    (
      typeof action.target_id !== "string" ||
      action.target_id.trim() === ""
    )
  ) {
    errors.push(
      "TARGET_ID_REQUIRED"
    );
  }


  /*
   * ---------------------------------------------
   * Result
   * ---------------------------------------------
   */

  return {
    valid:
      errors.length === 0,

    errors
  };
}