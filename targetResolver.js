/**
 * P6 Target Resolver
 *
 * Resolves P5's target_id into the current live DOM element.
 *
 * P2 contract:
 * - Each live DOM element receives a stable data-agent-id.
 * - The same DOM node keeps the same ID across captures.
 * - A newly created/re-rendered DOM node receives a new ID.
 *
 * P6 validates the element again immediately before execution.
 */

export function resolveTarget(targetId) {

  // 1. No valid target ID provided
  if (!targetId || typeof targetId !== "string") {
    return {
      success: false,
      status: "MISSING_TARGET_ID",
      element: null
    };
  }

  // 2. Resolve using P2's data-agent-id scheme
  const element = document.querySelector(
    `[data-agent-id="${CSS.escape(targetId)}"]`
  );

  // 3. Target no longer exists in the current DOM
  //
  // This also covers stale IDs when an old DOM node was removed
  // and replaced by a new node with a different target_id.
  if (!element) {
    return {
      success: false,
      status: "TARGET_NOT_FOUND",
      element: null
    };
  }

  // 4. Check visibility
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  const isVisible =
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    parseFloat(style.opacity) > 0 &&
    rect.width > 0 &&
    rect.height > 0;

  if (!isVisible) {
    return {
      success: false,
      status: "TARGET_NOT_VISIBLE",
      element: null
    };
  }

  // 5. Check whether the target is disabled
  //
  // Native disabled applies to form controls.
  // aria-disabled covers custom interactive elements that
  // communicate their disabled state through ARIA.
  const isDisabled =
    element.disabled === true ||
    element.getAttribute("aria-disabled") === "true";

  if (isDisabled) {
    return {
      success: false,
      status: "TARGET_DISABLED",
      element: null
    };
  }

  // 6. Check whether another element is covering the target
  if (isCovered(element)) {
    return {
      success: false,
      status: "TARGET_COVERED",
      element: null
    };
  }

  // 7. Target is valid and currently usable
  return {
    success: true,
    status: "TARGET_RESOLVED",
    element
  };
}


/**
 * Checks whether the center of the target is covered
 * by another element.
 */
function isCovered(element) {

  const rect = element.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const topElement = document.elementFromPoint(
    centerX,
    centerY
  );

  if (!topElement) {
    return true;
  }

  return !element.contains(topElement);
}

// NOTE:
// P2's MutationObserver-based continuous ID assignment is not
// implemented yet. Therefore, newly created elements may not
// have a data-agent-id until the next perception/capture cycle.
//
// P6 intentionally does NOT generate fallback IDs.
// If an element has no target_id, resolution fails safely.