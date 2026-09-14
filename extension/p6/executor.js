import { isAllowedProtocol } from "./hardening/securityPolicy.js";
import { createExecutionResult } from "./executionResult.js";

function failed(action, targetId, reason) {
  return createExecutionResult({
    status: "FAILED",
    action,
    target_id: targetId ?? null,
    reason
  });
}

function blocked(action, targetId, reason) {
  return createExecutionResult({
    status: "BLOCKED",
    action,
    target_id: targetId ?? null,
    reason
  });
}

function executed(action, targetId, reason = null) {
  return createExecutionResult({
    status: "EXECUTED",
    action,
    target_id: targetId ?? null,
    reason
  });
}

function getNavigationUrl(agentAction) {
  if (!agentAction || !agentAction.metadata) {
    return null;
  }

  return agentAction.metadata.url ?? null;
}

/**
 * Kept exported for backwards compatibility and tests.
 *
 * The actual protocol allowlist lives in securityPolicy.js.
 * There is deliberately no second local protocol list here.
 */
export function isAllowedNavigationUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return isAllowedProtocol(parsed.protocol);
  } catch {
    return false;
  }
}

function getElementTargetId(agentAction) {
  return agentAction?.target_id ?? null;
}

function isSupportedTextInput(element) {
  if (!element || element.tagName !== "INPUT") {
    return element?.tagName === "TEXTAREA";
  }

  const type = (element.type || "text").toLowerCase();

  return [
    "text",
    "email",
    "search",
    "tel",
    "url",
    "password",
    "number"
  ].includes(type);
}

function setNativeInputValue(element, value) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(
    prototype,
    "value"
  );

  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function executeClick(agentAction, element) {
  const targetId = getElementTargetId(agentAction);

  if (!element) {
    return failed(agentAction.action, targetId, "TARGET_NOT_FOUND");
  }

  try {
    element.click();

    return executed(
      agentAction.action,
      targetId
    );
  } catch (error) {
    return failed(
      agentAction.action,
      targetId,
      error?.message || "CLICK_FAILED"
    );
  }
}

function executeType(agentAction, element) {
  const targetId = getElementTargetId(agentAction);

  if (!element) {
    return failed(agentAction.action, targetId, "TARGET_NOT_FOUND");
  }

  if (!isSupportedTextInput(element)) {
    return failed(
      agentAction.action,
      targetId,
      "INVALID_TYPE_TARGET"
    );
  }

  const value = agentAction?.metadata?.text;

  if (typeof value !== "string") {
    return failed(
      agentAction.action,
      targetId,
      "TYPE_VALUE_MISSING"
    );
  }

  try {
    setNativeInputValue(element, value);

    element.dispatchEvent(
      new Event("input", {
        bubbles: true,
        composed: true
      })
    );

    element.dispatchEvent(
      new Event("change", {
        bubbles: true,
        composed: true
      })
    );

    return executed(
      agentAction.action,
      targetId
    );
  } catch (error) {
    return failed(
      agentAction.action,
      targetId,
      error?.message || "TYPE_FAILED"
    );
  }
}

function executeScroll(agentAction) {
  const amount = agentAction?.metadata?.amount;

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return failed(
      agentAction.action,
      getElementTargetId(agentAction),
      "SCROLL_AMOUNT_INVALID"
    );
  }

  try {
    window.scrollBy({
      top: amount,
      left: 0,
      behavior: "auto"
    });

    return executed(
      agentAction.action,
      getElementTargetId(agentAction)
    );
  } catch (error) {
    return failed(
      agentAction.action,
      getElementTargetId(agentAction),
      error?.message || "SCROLL_FAILED"
    );
  }
}

function executeNavigate(agentAction) {
  const targetId = getElementTargetId(agentAction);
  const url = getNavigationUrl(agentAction);

  if (typeof url !== "string" || !url.trim()) {
    return failed(
      agentAction.action,
      targetId,
      "NAVIGATION_URL_MISSING"
    );
  }

  if (!isAllowedNavigationUrl(url)) {
    return blocked(
      agentAction.action,
      targetId,
      "UNSAFE_NAVIGATION_BLOCKED"
    );
  }

  try {
    window.location.assign(url);

    return executed(
      agentAction.action,
      targetId
    );
  } catch (error) {
    return failed(
      agentAction.action,
      targetId,
      error?.message || "NAVIGATION_FAILED"
    );
  }
}

async function executeWait(agentAction) {
  const targetId = getElementTargetId(agentAction);

  const duration =
    agentAction?.metadata?.duration ??
    agentAction?.metadata?.ms;

  /*
   * P5 sends "wait" as a no-op signal in three cases — nothing changed,
   * low confidence, or a blocked sensitive field — and none of them
   * include a duration. Treat "no duration provided" as an immediate
   * no-op success rather than an error. Only actually sleep if a caller
   * explicitly supplies one.
   */
  if (duration === undefined || duration === null) {
    return executed(agentAction.action, targetId, "NO_OP_WAIT");
  }

  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    return failed(
      agentAction.action,
      targetId,
      "WAIT_DURATION_INVALID"
    );
  }

  try {
    await new Promise((resolve) => {
      setTimeout(resolve, duration);
    });

    return executed(
      agentAction.action,
      targetId
    );
  } catch (error) {
    return failed(
      agentAction.action,
      targetId,
      error?.message || "WAIT_FAILED"
    );
  }
}

function executeDone(agentAction) {
  // "done" carries no DOM target and requires no browser action —
  // P5 uses it to signal the task is complete. Nothing to execute.
  return executed(
    agentAction.action,
    getElementTargetId(agentAction),
    "TASK_COMPLETE"
  );
}

/**
 * Executes a validated/safe P5 action.
 *
 * This function is async because the wait action genuinely waits before
 * returning its execution result. Therefore every caller must await it.
 */
export async function executeAction(agentAction, element = null) {
  if (!agentAction || typeof agentAction !== "object") {
    return failed(
      null,
      null,
      "INVALID_ACTION"
    );
  }

  switch (agentAction.action) {
    case "click":
      return executeClick(agentAction, element);

    case "type":
      return executeType(agentAction, element);

    case "scroll":
      return executeScroll(agentAction);

    case "navigate":
      return executeNavigate(agentAction);

    case "wait":
      return executeWait(agentAction);

    case "done":
      return executeDone(agentAction);

    default:
      return failed(
        agentAction.action,
        getElementTargetId(agentAction),
        "UNSUPPORTED_ACTION"
      );
  }
}