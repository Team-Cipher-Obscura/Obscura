import {
  evaluateAction
} from "./safetyGate.js";

import {
  executeAction
} from "./executor.js";

import {
  requestConfirmation,
  buildConfirmationPayload,
  registerConfirmationMessageListener
} from "./confirmationFlow.js";


function getDefaultSendMessage() {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function"
  ) {
    return (message) =>
      chrome.runtime.sendMessage(message);
  }

  return null;
}


/**
 * Create the standard blocked result used by the pipeline.
 */
function blockedResult(
  agentAction,
  safetyResult
) {
  return {
    status: "BLOCKED",
    action:
      agentAction?.action || null,
    target_id:
      agentAction?.target_id || null,
    reason:
      safetyResult?.reason || null,
    detail:
      safetyResult?.status || null
  };
}


/**
 * Create the standard confirmation-pending result.
 *
 * This is retained as a defensive result for callers that invoke
 * executeConfirmedAction() incorrectly or for future integrations.
 */
function confirmationPendingResult(
  agentAction,
  safetyResult,
  reason = null
) {
  return {
    status: "CONFIRMATION_PENDING",
    action:
      agentAction?.action || null,
    target_id:
      agentAction?.target_id || null,
    reason:
      reason ||
      safetyResult?.reason ||
      null,
    detail:
      safetyResult?.status || null
  };
}


/**
 * Process a P5 agent action through the complete P6 pipeline.
 *
 * IMPORTANT:
 *
 * processAction() is asynchronous because risky actions may require
 * user confirmation.
 *
 * The optional sendMessage parameter exists specifically so tests
 * and extension integrations can provide the Phase 4 message sender.
 *
 * processAction(action, sendMessage)
 *
 * Flow:
 *
 *   action
 *     ↓
 *   safety gate
 *     ↓
 *   BLOCK --------------------> blocked
 *     ↓
 *   CONFIRM
 *     ↓
 *   confirmation request
 *     ↓
 *   user approval
 *     ↓
 *   SAFETY GATE AGAIN
 *     ↓
 *   fresh target resolution
 *     ↓
 *   fresh P3 sensitive check
 *     ↓
 *   fresh risk classification
 *     ↓
 *   execute
 */
export async function processAction(
  agentAction,
  sendMessage = getDefaultSendMessage()
) {
  // -----------------------------------------
  // 0. Confirmation message listener
  // -----------------------------------------

  registerConfirmationMessageListener();


  // -----------------------------------------
  // 1. Initial safety gate
  // -----------------------------------------

  const safetyResult =
    evaluateAction(agentAction);


  // -----------------------------------------
  // 2. HARD BLOCK
  // -----------------------------------------

  if (
    safetyResult.decision === "BLOCK"
  ) {
    return blockedResult(
      agentAction,
      safetyResult
    );
  }


  // -----------------------------------------
  // 3. CONFIRMATION REQUIRED
  // -----------------------------------------

  if (
    safetyResult.decision === "CONFIRM"
  ) {
    if (typeof sendMessage !== "function") {
      return {
        ...confirmationPendingResult(
          agentAction,
          safetyResult,
          "Confirmation transport is unavailable."
        ),
        status: "FAILED"
      };
    }

    let confirmationPayload;

    try {
      confirmationPayload =
        buildConfirmationPayload(
          agentAction,
          safetyResult.element
        );
    } catch (error) {
      return {
        status: "FAILED",
        action:
          agentAction?.action || null,
        target_id:
          agentAction?.target_id || null,
        reason:
          error?.message ||
          "Could not build confirmation request.",
        detail:
          "CONFIRMATION_PAYLOAD_ERROR"
      };
    }


    const approved =
      await requestConfirmation({
        sendMessage,

        action:
          confirmationPayload.action,

        targetSummary:
          confirmationPayload.targetSummary
      });


    // -----------------------------------------
    // 4. USER REJECTED / TIMEOUT
    // -----------------------------------------

    if (!approved) {
      return {
        status: "BLOCKED",
        action:
          agentAction?.action || null,
        target_id:
          agentAction?.target_id || null,
        reason:
          "CONFIRMATION_REJECTED",
        detail:
          "CONFIRMATION_DENIED"
      };
    }


    // -----------------------------------------
    // 5. TOCTOU RECHECK
    //
    // DO NOT reuse safetyResult.element.
    // The DOM and P3 sensitive map may have changed
    // while the confirmation dialog was open.
    // -----------------------------------------

    const recheckResult =
      evaluateAction(agentAction);


    // -----------------------------------------
    // 6. Fresh safety block wins
    // -----------------------------------------

    if (
      recheckResult.decision === "BLOCK"
    ) {
      return blockedResult(
        agentAction,
        recheckResult
      );
    }


    // -----------------------------------------
    // 7. A confirmed action must not silently
    //    bypass a new confirmation requirement.
    // -----------------------------------------

    if (
      recheckResult.decision === "CONFIRM"
    ) {
      return confirmationPendingResult(
        agentAction,
        recheckResult,
        "Action still requires confirmation."
      );
    }


    // -----------------------------------------
    // 8. EXECUTE USING FRESH TARGET
    // -----------------------------------------

    return executeAction(
      agentAction,
      recheckResult.element
    );
  }


  // -----------------------------------------
  // 9. SAFE EXECUTION
  // -----------------------------------------

  return executeAction(
    agentAction,
    safetyResult.element
  );
}


/**
 * Backward-compatible helper retained for callers/tests that
 * explicitly separate confirmation from execution.
 *
 * This function does NOT approve confirmation itself.
 *
 * It performs a fresh safety evaluation and only executes when
 * the action is currently safe.
 */
export function executeConfirmedAction(
  agentAction
) {
  const safetyResult =
    evaluateAction(agentAction);


  if (
    safetyResult.decision === "BLOCK"
  ) {
    return blockedResult(
      agentAction,
      safetyResult
    );
  }


  if (
    safetyResult.decision === "CONFIRM"
  ) {
    return confirmationPendingResult(
      agentAction,
      safetyResult,
      "Confirmation is still required."
    );
  }


  return executeAction(
    agentAction,
    safetyResult.element
  );
}