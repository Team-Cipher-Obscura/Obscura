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
      safetyResult?.reason ||
      "SAFETY_BLOCKED",

    detail:
      safetyResult?.status || null
  };
}


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
      "CONFIRMATION_REQUIRED",

    detail:
      safetyResult?.status || null
  };
}


/**
 * Process a P5 AgentResponse through the complete P6
 * safety and execution pipeline.
 *
 * Risky actions:
 *
 *   evaluate
 *      ↓
 *   CONFIRM
 *      ↓
 *   requestConfirmation
 *      ↓
 *   user response
 *      ↓
 *   FRESH evaluate with confirmationGranted=true
 *      ↓
 *   execute
 *
 * The second evaluation is deliberately required because
 * the DOM and P3 sensitive map can change while the user
 * is deciding.
 */
export async function processAction(
  agentAction,
  sendMessage = getDefaultSendMessage()
) {
  /*
   * Ensure the browser-level confirmation response listener
   * is registered before a confirmation request can be made.
   */
  registerConfirmationMessageListener();


  /*
   * ---------------------------------------------
   * FIRST SAFETY EVALUATION
   * ---------------------------------------------
   */

  const safetyResult =
    evaluateAction(
      agentAction
    );


  /*
   * ---------------------------------------------
   * HARD BLOCK
   * ---------------------------------------------
   */

  if (
    safetyResult.decision === "BLOCK"
  ) {
    return blockedResult(
      agentAction,
      safetyResult
    );
  }


  /*
   * ---------------------------------------------
   * CONFIRMATION
   * ---------------------------------------------
   */

  if (
    safetyResult.decision === "CONFIRM"
  ) {
    if (
      typeof sendMessage !== "function"
    ) {
      return {
        status: "FAILED",

        action:
          agentAction?.action || null,

        target_id:
          agentAction?.target_id || null,

        reason:
          "Confirmation transport is unavailable.",

        detail:
          "CONFIRMATION_TRANSPORT_UNAVAILABLE"
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


    /*
     * -------------------------------------------
     * USER REJECTED / TIMEOUT
     * -------------------------------------------
     */

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


    /*
     * -------------------------------------------
     * CRITICAL PHASE 6 FIX
     * -------------------------------------------
     *
     * The action has now been explicitly approved by
     * the user.
     *
     * BUT we must NOT reuse the previous safety result.
     *
     * The DOM and P3 sensitive map may have changed.
     *
     * Therefore run the safety gate again.
     *
     * confirmationGranted=true tells safetyGate that this
     * specific action has already received confirmation,
     * allowing a previously-CONFIRM action to proceed to
     * execution after all other safety checks pass.
     *
     * Without this flag:
     *
     *   CONFIRM
     *      ↓
     *   approve
     *      ↓
     *   evaluateAction()
     *      ↓
     *   CONFIRM again
     *
     * which makes every risky action permanently
     * CONFIRMATION_PENDING.
     */
    const recheckResult =
      evaluateAction(
        agentAction,
        {
          confirmationGranted: true
        }
      );


    /*
     * A new hard safety violation always wins over
     * the previous user approval.
     */
    if (
      recheckResult.decision === "BLOCK"
    ) {
      return blockedResult(
        agentAction,
        recheckResult
      );
    }


    /*
     * In normal operation a correctly implemented
     * confirmationGranted path should not return CONFIRM.
     *
     * Keep this defensive branch so a future safety-rule
     * change cannot silently execute an action that has
     * acquired a NEW confirmation requirement.
     */
    if (
      recheckResult.decision === "CONFIRM"
    ) {
      return confirmationPendingResult(
        agentAction,
        recheckResult,
        "Action still requires confirmation."
      );
    }


    /*
     * Execute using the element obtained by the FRESH
     * safety evaluation.
     *
     * Never use safetyResult.element from before confirmation.
     */
    return executeAction(
      agentAction,
      recheckResult.element
    );
  }


  /*
   * ---------------------------------------------
   * SAFE ACTION
   * ---------------------------------------------
   */

  return executeAction(
    agentAction,
    safetyResult.element
  );
}


/**
 * Backward-compatible helper.
 *
 * This helper intentionally does not manufacture confirmation.
 * If the action currently requires confirmation, it reports
 * CONFIRMATION_PENDING.
 */
export function executeConfirmedAction(
  agentAction
) {
  const safetyResult =
    evaluateAction(
      agentAction
    );


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