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
    return chrome.runtime.sendMessage.bind(
      chrome.runtime
    );
  }

  return null;
}


function blockedResult(
  action,
  reason
) {
  return createExecutionResult({
    status: "BLOCKED",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    reason
  });
}


function confirmationPendingResult(
  action,
  reason
) {
  return createExecutionResult({
    status: "CONFIRMATION_PENDING",
    action: action?.action ?? null,
    target_id: action?.target_id ?? null,
    reason
  });
}


/**
 * Main P6 execution pipeline.
 *
 * Safety-gate contract:
 *
 *   decision === "EXECUTE"
 *   decision === "CONFIRM"
 *   decision === "BLOCK"
 *
 * Execution-result contract:
 *
 *   status === "EXECUTED"
 *   status === "BLOCKED"
 *   status === "FAILED"
 *   status === "CONFIRMATION_PENDING"
 *
 * The two contracts are intentionally kept separate:
 *
 *   safetyGate -> decision
 *   executor  -> execution result status
 */
export async function processAction(
  agentAction,
  sendMessage = getDefaultSendMessage()
) {

  registerConfirmationMessageListener();


  // --------------------------------------------------
  // 1. INITIAL SAFETY EVALUATION
  // --------------------------------------------------

  const initialEvaluation =
    evaluateAction(agentAction);


  // --------------------------------------------------
  // 2. HARD BLOCK
  // --------------------------------------------------

  if (
    initialEvaluation.decision === "BLOCK"
  ) {

    return blockedResult(
      agentAction,
      initialEvaluation.reason
    );
  }


  // --------------------------------------------------
  // 3. CONFIRMATION REQUIRED
  // --------------------------------------------------

  if (
    initialEvaluation.decision === "CONFIRM"
  ) {

    if (
      typeof sendMessage !== "function"
    ) {
      return blockedResult(
        agentAction,
        "CONFIRMATION_CHANNEL_UNAVAILABLE"
      );
    }


    /*
     * Build the confirmation request from the
     * privacy-safe representation.
     *
     * Do not send arbitrary DOM content, form values,
     * or action metadata to the confirmation UI.
     */
    const confirmationPayload =
      buildConfirmationPayload(
        agentAction,
        initialEvaluation.element
      );


    const approved =
      await requestConfirmation({
        sendMessage,
        action:
          confirmationPayload.action,
        targetSummary:
          confirmationPayload.targetSummary
      });


    // --------------------------------------------------
    // 3A. USER REJECTED / TIMEOUT
    // --------------------------------------------------

    if (!approved) {

      return blockedResult(
        agentAction,
        "CONFIRMATION_REJECTED"
      );
    }


    // --------------------------------------------------
    // 3B. FRESH TOCTOU SAFETY RECHECK
    // --------------------------------------------------

    /*
     * IMPORTANT:
     *
     * Never reuse initialEvaluation.element.
     *
     * The DOM or P3 sensitive map may have changed while
     * the confirmation dialog was open.
     *
     * Re-run the complete safety gate so that:
     *
     *   target resolution
     *       ↓
     *   visibility/enabled/covered checks
     *       ↓
     *   P3 sensitive check
     *       ↓
     *   risk classification
     *
     * all happen again.
     *
     * confirmationGranted only prevents the already-approved
     * risky action from requesting the same confirmation again.
     */
    const recheckEvaluation =
      evaluateAction(
        agentAction,
        {
          confirmationGranted: true
        }
      );


    // --------------------------------------------------
    // 3C. P3 / SAFETY CHANGE DURING CONFIRMATION
    // --------------------------------------------------

    if (
      recheckEvaluation.decision === "BLOCK"
    ) {

      return blockedResult(
        agentAction,
        recheckEvaluation.reason
      );
    }


    /*
     * Defensive handling:
     *
     * If a fresh safety evaluation still requires confirmation,
     * do not execute it automatically.
     */
    if (
      recheckEvaluation.decision === "CONFIRM"
    ) {

      return confirmationPendingResult(
        agentAction,
        recheckEvaluation.reason ||
          "CONFIRMATION_REQUIRED_AFTER_RECHECK"
      );
    }


    // --------------------------------------------------
    // 3D. EXECUTE ONLY ON EXPLICIT EXECUTE DECISION
    // --------------------------------------------------

    if (
      recheckEvaluation.decision === "EXECUTE"
    ) {

      return await executeAction(
        agentAction,
        recheckEvaluation.element
      );
    }


    /*
     * Fail closed.
     *
     * A future/unknown safety-gate decision must never
     * accidentally fall through to execution.
     */
    return blockedResult(
      agentAction,
      "UNKNOWN_SAFETY_DECISION"
    );
  }


  // --------------------------------------------------
  // 4. SAFE / EXECUTE
  // --------------------------------------------------

  if (
    initialEvaluation.decision === "EXECUTE"
  ) {

    return await executeAction(
      agentAction,
      initialEvaluation.element
    );
  }


  // --------------------------------------------------
  // 5. UNKNOWN SAFETY DECISION
  // --------------------------------------------------

  /*
   * Fail closed.
   *
   * A new/unknown safety-gate decision must never
   * accidentally fall through to execution.
   */
  return blockedResult(
    agentAction,
    "UNKNOWN_SAFETY_DECISION"
  );
}


/**
 * Backwards-compatible helper.
 *
 * This helper does NOT manufacture confirmation approval.
 * If the safety gate says CONFIRM, it returns a pending result.
 *
 * Because executeAction() is asynchronous, this helper must
 * also be asynchronous.
 */
export async function executeConfirmedAction(
  agentAction
) {

  const evaluation =
    evaluateAction(agentAction);


  if (
    evaluation.decision === "BLOCK"
  ) {

    return blockedResult(
      agentAction,
      evaluation.reason
    );
  }


  if (
    evaluation.decision === "CONFIRM"
  ) {

    return confirmationPendingResult(
      agentAction,
      evaluation.reason
    );
  }


  if (
    evaluation.decision === "EXECUTE"
  ) {

    return await executeAction(
      agentAction,
      evaluation.element
    );
  }


  // Fail closed for an unknown decision.
  return blockedResult(
    agentAction,
    "UNKNOWN_SAFETY_DECISION"
  );
}