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

import {
  createExecutionResult
} from "./executionResult.js";

function getDefaultSendMessage() {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function"
  ) {
    return chrome.runtime.sendMessage.bind(chrome.runtime);
  }

  return null;
}

function blockedResult(action, reason) {
  return createExecutionResult({
    status: "BLOCKED",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    reason
  });
}

function confirmationPendingResult(action, reason) {
  return createExecutionResult({
    status: "CONFIRMATION_PENDING",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    reason
  });
}

/**
 * Main P6 action pipeline:
 *
 * 1. Validate + resolve + inspect fresh P3 state.
 * 2. Block immediately if unsafe.
 * 3. Request confirmation when required.
 * 4. After approval, repeat the complete safety evaluation with fresh state.
 * 5. Execute only the freshly revalidated target.
 */
export async function processAction(
  agentAction,
  sendMessage = getDefaultSendMessage()
) {
  registerConfirmationMessageListener();

  const initialEvaluation = evaluateAction(agentAction);

  if (initialEvaluation.status === "BLOCKED") {
    return blockedResult(
      agentAction,
      initialEvaluation.reason
    );
  }

  if (initialEvaluation.status === "CONFIRMATION_PENDING") {
    if (typeof sendMessage !== "function") {
      return blockedResult(
        agentAction,
        "CONFIRMATION_CHANNEL_UNAVAILABLE"
      );
    }

    const confirmationPayload =
      buildConfirmationPayload(
        agentAction,
        initialEvaluation.element
      );

    const approved = await requestConfirmation({
      sendMessage,
      action: confirmationPayload.action,
      targetSummary: confirmationPayload.targetSummary
    });

    if (!approved) {
      return blockedResult(
        agentAction,
        "CONFIRMATION_REJECTED"
      );
    }

    /*
     * Critical TOCTOU protection:
     *
     * Approval does NOT authorize the stale target/evaluation.
     * The entire safety evaluation is repeated using fresh DOM/P3 state.
     *
     * confirmationGranted prevents the freshly evaluated risky action
     * from immediately asking for the same confirmation again.
     */
    const recheckEvaluation = evaluateAction(
      agentAction,
      {
        confirmationGranted: true
      }
    );

    if (recheckEvaluation.status === "BLOCKED") {
      return blockedResult(
        agentAction,
        recheckEvaluation.reason
      );
    }

    if (
      recheckEvaluation.status ===
      "CONFIRMATION_PENDING"
    ) {
      return confirmationPendingResult(
        agentAction,
        "CONFIRMATION_REQUIRED_AFTER_RECHECK"
      );
    }

    return await executeAction(
      agentAction,
      recheckEvaluation.element
    );
  }

  return await executeAction(
    agentAction,
    initialEvaluation.element
  );
}

/**
 * Backwards-compatible helper for callers that already have an action
 * and expect the pipeline to execute it after a successful safety check.
 *
 * This function is deliberately async because executeAction() is async.
 */
export async function executeConfirmedAction(
  agentAction
) {
  const evaluation = evaluateAction(agentAction);

  if (evaluation.status === "BLOCKED") {
    return blockedResult(
      agentAction,
      evaluation.reason
    );
  }

  if (
    evaluation.status ===
    "CONFIRMATION_PENDING"
  ) {
    return confirmationPendingResult(
      agentAction,
      evaluation.reason
    );
  }

  return await executeAction(
    agentAction,
    evaluation.element
  );
}