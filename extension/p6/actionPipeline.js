import { evaluateAction } from "./safetyGate.js";
import { executeAction } from "./executor.js";
import { requestConfirmation } from "./confirmationFlow.js";

/**
 * Send confirmation messages through the extension runtime when
 * running inside the real extension.
 *
 * Tests can inject their own sendMessage function.
 */
function getDefaultSendMessage() {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function"
  ) {
    return (message) => chrome.runtime.sendMessage(message);
  }

  return null;
}

/**
 * Create a privacy-safe action payload for the confirmation UI.
 *
 * In particular, never send metadata.value because a type action
 * may contain a password, token, email, or other sensitive input.
 */
function createConfirmationAction(agentAction) {
  if (!agentAction || typeof agentAction !== "object") {
    return null;
  }

  return {
    action: agentAction.action || null,
    target_id: agentAction.target_id || null,
    confidence:
      typeof agentAction.confidence === "number"
        ? agentAction.confidence
        : null
  };
}

/**
 * Create a short target description for the confirmation UI.
 *
 * This deliberately avoids sending the full DOM element or the
 * original action metadata.
 */
function createTargetSummary(agentAction, element) {
  if (agentAction?.action === "navigate") {
    const url = agentAction?.metadata?.url;

    if (!url) {
      return "Navigation";
    }

    try {
      const parsedUrl = new URL(
        url,
        window.location.href
      );

      return `Navigate to ${parsedUrl.origin}${parsedUrl.pathname}`;
    } catch {
      return "Navigation";
    }
  }

  if (!element) {
    return agentAction?.action || "Action";
  }

  const ariaLabel =
    element.getAttribute("aria-label");

  const title =
    element.getAttribute("title");

  const text =
    element.innerText ||
    element.textContent ||
    "";

  const summary =
    ariaLabel ||
    title ||
    text;

  const normalized =
    summary
      .replace(/\s+/g, " ")
      .trim();

  if (!normalized) {
    return `${agentAction?.action || "Action"} target`;
  }

  // Keep confirmation UI summaries short.
  return normalized.slice(0, 120);
}

/**
 * Process a P5 action.
 *
 * Safe actions execute immediately.
 * Blocked actions never execute.
 * Risky actions require confirmation.
 *
 * Confirmation approval always causes a FRESH safety evaluation.
 * The old DOM element is never reused.
 */
export async function processAction(
  agentAction,
  { sendMessage } = {}
) {
  const safetyResult =
    evaluateAction(agentAction);

  // -----------------------------------------
  // 1. BLOCKED
  // -----------------------------------------
  if (safetyResult.decision === "BLOCK") {
    return {
      status: "BLOCKED",
      action: agentAction?.action || null,
      target_id: agentAction?.target_id || null,
      reason:
        safetyResult.reason ||
        safetyResult.status ||
        null,
      detail: safetyResult.status
    };
  }

  // -----------------------------------------
  // 2. CONFIRMATION REQUIRED
  // -----------------------------------------
  if (safetyResult.decision === "CONFIRM") {
    const confirmationSender =
      sendMessage ||
      getDefaultSendMessage();

    if (!confirmationSender) {
      return {
        status: "BLOCKED",
        action: agentAction?.action || null,
        target_id: agentAction?.target_id || null,
        reason: "CONFIRMATION_UNAVAILABLE",
        detail: "No confirmation message sender is available."
      };
    }

    const confirmationAction =
      createConfirmationAction(agentAction);

    const targetSummary =
      createTargetSummary(
        agentAction,
        safetyResult.element
      );

    let approved = false;

    try {
      approved =
        await requestConfirmation({
          sendMessage: confirmationSender,
          action: confirmationAction,
          targetSummary
        });
    } catch {
      approved = false;
    }

    // No response / rejection / messaging failure
    // must never result in execution.
    if (!approved) {
      return {
        status: "CONFIRMATION_REJECTED",
        action: agentAction?.action || null,
        target_id: agentAction?.target_id || null,
        reason: "USER_DID_NOT_APPROVE"
      };
    }

    // -----------------------------------------
    // 3. TOCTOU RE-CHECK
    // -----------------------------------------
    //
    // The page may have changed while the confirmation
    // dialog was open.
    //
    // Therefore:
    // - resolve the target again
    // - check P3 sensitivity again
    // - check visibility/disabled/covered state again
    // - classify the current target again
    //
    // The original safetyResult.element is NEVER reused.
    const confirmedSafetyResult =
      evaluateAction(
        agentAction,
        {
          confirmationGranted: true
        }
      );

    if (
      confirmedSafetyResult.decision === "BLOCK"
    ) {
      return {
        status: "BLOCKED",
        action: agentAction?.action || null,
        target_id: agentAction?.target_id || null,
        reason:
          confirmedSafetyResult.reason ||
          confirmedSafetyResult.status ||
          null,
        detail: confirmedSafetyResult.status
      };
    }

    if (
      confirmedSafetyResult.decision === "CONFIRM"
    ) {
      return {
        status: "BLOCKED",
        action: agentAction?.action || null,
        target_id: agentAction?.target_id || null,
        reason: "CONFIRMATION_REVALIDATION_FAILED",
        detail: confirmedSafetyResult.status
      };
    }

    // -----------------------------------------
    // 4. EXECUTE USING FRESH TARGET
    // -----------------------------------------
    return executeAction(
      agentAction,
      confirmedSafetyResult.element
    );
  }

  // -----------------------------------------
  // 5. SAFE EXECUTION
  // -----------------------------------------
  return executeAction(
    agentAction,
    safetyResult.element
  );
}

/**
 * Execute an action after confirmation has already been granted
 * by the caller.
 *
 * This function STILL performs a fresh safety check.
 *
 * It is intentionally one-shot: confirmationGranted only
 * satisfies the confirmation requirement for this invocation.
 */
export function executeConfirmedAction(
  agentAction
) {
  const safetyResult =
    evaluateAction(
      agentAction,
      {
        confirmationGranted: true
      }
    );

  if (safetyResult.decision === "BLOCK") {
    return {
      status: "BLOCKED",
      action: agentAction?.action || null,
      target_id: agentAction?.target_id || null,
      reason:
        safetyResult.reason ||
        safetyResult.status ||
        null
    };
  }

  if (safetyResult.decision === "CONFIRM") {
    return {
      status: "BLOCKED",
      action: agentAction?.action || null,
      target_id: agentAction?.target_id || null,
      reason: "CONFIRMATION_REVALIDATION_FAILED"
    };
  }

  return executeAction(
    agentAction,
    safetyResult.element
  );
}