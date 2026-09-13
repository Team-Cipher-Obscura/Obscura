import {
  isAllowedProtocol
} from "./hardening/securityPolicy.js";

import {
  createExecutionResult
} from "./executionResult.js";


function failed(
  action,
  target_id,
  reason
) {
  return createExecutionResult(
    "FAILED",
    action,
    target_id,
    reason
  );
}


function blocked(
  action,
  target_id,
  reason
) {
  return createExecutionResult(
    "BLOCKED",
    action,
    target_id,
    reason
  );
}


function executed(
  action,
  target_id
) {
  return createExecutionResult(
    "EXECUTED",
    action,
    target_id,
    null
  );
}


/**
 * Resolve the navigation URL from an AgentResponse.
 *
 * P5 navigation actions carry their URL in metadata.url.
 */
function getNavigationUrl(
  agentAction
) {
  const url =
    agentAction?.metadata?.url;

  if (
    typeof url !== "string" ||
    url.trim() === ""
  ) {
    return null;
  }

  return url.trim();
}


/**
 * Navigation URL validation helper retained for tests
 * and backwards compatibility.
 *
 * The actual protocol decision is delegated to the
 * centralized security policy.
 */
export function isAllowedNavigationUrl(
  url
) {
  if (
    typeof url !== "string" ||
    url.trim() === ""
  ) {
    return false;
  }

  let parsed;

  try {
    parsed =
      new URL(url);
  } catch {
    return false;
  }

  return isAllowedProtocol(
    parsed.protocol
  );
}


/**
 * Execute a click action.
 */
function executeClick(
  agentAction,
  element
) {
  if (!element) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "TARGET_REQUIRED"
    );
  }

  if (
    typeof element.click !== "function"
  ) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "TARGET_NOT_CLICKABLE"
    );
  }

  try {
    element.click();

    return executed(
      agentAction.action,
      agentAction.target_id
    );
  } catch (error) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      error?.message ||
        "CLICK_FAILED"
    );
  }
}


/**
 * Execute a type action using the native value setter.
 *
 * This works with frameworks such as React that intercept
 * ordinary property assignment.
 */
function executeType(
  agentAction,
  element
) {
  if (!element) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "TARGET_REQUIRED"
    );
  }

  const tagName =
    (
      element.tagName ||
      ""
    ).toLowerCase();

  const type =
    (
      element.getAttribute("type") ||
      ""
    ).toLowerCase();

  const supported =
    tagName === "textarea" ||
    (
      tagName === "input" &&
      (
        type === "" ||
        type === "text" ||
        type === "email" ||
        type === "search" ||
        type === "tel" ||
        type === "url" ||
        type === "password" ||
        type === "number"
      )
    );

  if (!supported) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "UNSUPPORTED_TYPING_TARGET"
    );
  }


  const value =
    agentAction?.metadata?.text ??
    agentAction?.metadata?.value;

  if (
    typeof value !== "string"
  ) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "MISSING_TYPED_VALUE"
    );
  }


  try {
    element.focus();


    const prototype =
      tagName === "textarea"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;


    const descriptor =
      Object.getOwnPropertyDescriptor(
        prototype,
        "value"
      );


    if (
      descriptor &&
      typeof descriptor.set === "function"
    ) {
      descriptor.set.call(
        element,
        value
      );
    } else {
      element.value = value;
    }


    element.dispatchEvent(
      new Event(
        "input",
        {
          bubbles: true,
          composed: true
        }
      )
    );


    element.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true,
          composed: true
        }
      )
    );


    return executed(
      agentAction.action,
      agentAction.target_id
    );
  } catch (error) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      error?.message ||
        "TYPE_FAILED"
    );
  }
}


/**
 * Execute a scroll action.
 */
function executeScroll(
  agentAction
) {
  const direction =
    (
      agentAction?.metadata?.direction ||
      "down"
    ).toLowerCase();


  const amount =
    Number(
      agentAction?.metadata?.amount ??
      500
    );


  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "INVALID_SCROLL_AMOUNT"
    );
  }


  let deltaY = amount;

  if (
    direction === "up"
  ) {
    deltaY = -amount;
  }


  if (
    direction !== "up" &&
    direction !== "down"
  ) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "INVALID_SCROLL_DIRECTION"
    );
  }


  try {
    window.scrollBy({
      top: deltaY,
      left: 0,
      behavior: "auto"
    });

    return executed(
      agentAction.action,
      agentAction.target_id
    );
  } catch (error) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      error?.message ||
        "SCROLL_FAILED"
    );
  }
}


/**
 * Execute a navigation action.
 *
 * IMPORTANT:
 *
 * There is deliberately no local list such as:
 *
 *   protocol === "http:" || protocol === "https:"
 *
 * here.
 *
 * securityPolicy.js is the single source of truth.
 */
function executeNavigate(
  agentAction
) {
  const url =
    getNavigationUrl(
      agentAction
    );


  if (!url) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "MISSING_NAVIGATION_URL"
    );
  }


  if (
    !isAllowedNavigationUrl(url)
  ) {
    return blocked(
      agentAction.action,
      agentAction.target_id,
      "UNSAFE_NAVIGATION_BLOCKED"
    );
  }


  try {
    window.location.assign(
      url
    );

    return executed(
      agentAction.action,
      agentAction.target_id
    );
  } catch (error) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      error?.message ||
        "NAVIGATION_FAILED"
    );
  }
}


/**
 * Execute a wait action.
 *
 * The safety pipeline determines whether a wait action
 * is permitted; executor simply performs the requested delay.
 */
async function executeWait(
  agentAction
) {
  const duration =
    Number(
      agentAction?.metadata?.duration ??
      agentAction?.metadata?.ms ??
      0
    );


  if (
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    return failed(
      agentAction.action,
      agentAction.target_id,
      "INVALID_WAIT_DURATION"
    );
  }


  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        duration
      )
  );


  return executed(
    agentAction.action,
    agentAction.target_id
  );
}


/**
 * Main P6 execution boundary.
 *
 * Safety decisions must already have been made by safetyGate.
 * This function only performs the actual browser action and
 * retains defense-in-depth validation for execution-specific
 * requirements.
 */
export async function executeAction(
  agentAction,
  element = null
) {
  if (
    !agentAction ||
    typeof agentAction !== "object"
  ) {
    return failed(
      null,
      null,
      "INVALID_ACTION"
    );
  }


  const action =
    agentAction.action;

  const target_id =
    agentAction.target_id || null;


  switch (action) {

    case "click":
      return executeClick(
        agentAction,
        element
      );


    case "type":
      return executeType(
        agentAction,
        element
      );


    case "scroll":
      return executeScroll(
        agentAction
      );


    case "navigate":
      return executeNavigate(
        agentAction
      );


    case "wait":
      return executeWait(
        agentAction
      );


    default:
      return failed(
        action,
        target_id,
        "UNSUPPORTED_ACTION"
      );
  }
}