export function resolveTarget(targetId) {
  // 1. No/invalid target ID provided
  if (!targetId || typeof targetId !== "string") {
    return {
      success: false,
      status: "MISSING_TARGET_ID",
      element: null
    };
  }

  // 2. Find the element using P2's ID scheme
  const element = document.querySelector(
    `[data-agent-id="${CSS.escape(targetId)}"]`
  );

  // 3. Element no longer exists
  if (!element) {
    return {
      success: false,
      status: "TARGET_NOT_FOUND",
      element: null
    };
  }

  // 4. Check whether it is still attached to the DOM
  if (!element.isConnected) {
    return {
      success: false,
      status: "TARGET_DETACHED",
      element: null
    };
  }

  // 5. Check visibility
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  const isVisible =
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    rect.width > 0 &&
    rect.height > 0;

  if (!isVisible) {
    return {
      success: false,
      status: "TARGET_NOT_VISIBLE",
      element: null
    };
  }

  // 6. Check whether the element is disabled
  if (element.disabled === true) {
    return {
      success: false,
      status: "TARGET_DISABLED",
      element: null
    };
  }

  // 7. Check whether another element is covering the target
    if (isCovered(element)) {
    return {
        success: false,
        status: "TARGET_COVERED",
        element: null
    };
    }

    if (element.getAttribute("aria-disabled") === "true") {
    return {
        success: false,
        status: "TARGET_DISABLED",
        element: null
    };
    }

  // 8. Everything looks usable
  return {
    success: true,
    status: "TARGET_RESOLVED",
    element
  };
}

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