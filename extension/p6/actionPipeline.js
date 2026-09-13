import { evaluateAction } from "./safetyGate.js";
import { executeAction } from "./executor.js";
import { requestConfirmation } from "./confirmationFlow.js";


/**
 * Creates the result returned when a safety decision blocks
 * execution.
 */
function createBlockedResult(agentAction, safetyResult) {
  return {
    status: "BLOCKED",
    action: agentAction?.action || null,
    target_id: agentAction?.target_id || null,
    reason: safetyResult.reason || null,
    detail: safetyResult.status || null
  };
}


/**
 * Creates a privacy-safe confirmation payload.
 *
 * Do not send the complete P5 action to the confirmation UI.
 * In particular, metadata.value may contain a password or
 * other sensitive input.
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
 * Creates a short, privacy-safe confirmation summary.
 *
 * Sensitive form values are intentionally never included.
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

  return normalized.slice(0, 120);
}


/**
 * Process a structured P5 action.
 *
 * SAFE:
 *   safety check -> execute
 *
 * BLOCK:
 *   safety check -> blocked
 *
 * CONFIRM:
 *   safety check
 *      -> request user confirmation
 *      -> wait for response
 *      -> fresh safety check
 *      -> fresh target resolution
 *      -> fresh P3 sensitive check
 *      -> execute
 *
 * The DOM element returned by the first safety evaluation is
 * never reused after confirmation.
 */
export async function processAction(
  agentAction,
  {
    sendMessage
  } = {}
) {

  // -----------------------------------------
  // 1. FIRST SAFETY EVALUATION
  // -----------------------------------------

  const safetyResult =
    evaluateAction(agentAction);


  // -----------------------------------------
  // 2. BLOCKED
  // -----------------------------------------

  if (safetyResult.decision === "BLOCK") {
    return createBlockedResult(
      agentAction,
      safetyResult
    );
  }


  // -----------------------------------------
  // 3. CONFIRMATION REQUIRED
  // -----------------------------------------

  if (safetyResult.decision === "CONFIRM") {

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
          sendMessage,
          action: confirmationAction,
          targetSummary
        });

    } catch (error) {

      return {
        status: "BLOCKED",
        action: agentAction?.action || null,
        target_id: agentAction?.target_id || null,
        reason:
          "CONFIRMATION_FAILED",
        detail:
          error?.message ||
          "Confirmation request failed."
      };
    }


    // No response, timeout, or explicit rejection
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
    // 4. FRESH SAFETY EVALUATION
    // -----------------------------------------
    //
    // This is the TOCTOU protection.
    //
    // The original safetyResult.element is intentionally
    // NOT reused.
    //
    // evaluateAction() resolves the target again and checks
    // the current P3 registry again.
    //
    // confirmationGranted only satisfies the confirmation
    // requirement that the user has already approved.
    //
    const confirmedSafetyResult =
      evaluateAction(
        agentAction,
        {
          confirmationGranted: true
        }
      );


    // P3 or target safety wins over the earlier approval.
    if (confirmedSafetyResult.decision === "BLOCK") {
      return createBlockedResult(
        agentAction,
        confirmedSafetyResult
      );
    }


    // This is defensive. A correctly implemented
    // confirmationGranted evaluation should not return
    // CONFIRM, but if it ever does, fail closed.
    if (
      confirmedSafetyResult.decision === "CONFIRM"
    ) {
      return {
        status: "BLOCKED",
        action: agentAction?.action || null,
        target_id: agentAction?.target_id || null,
        reason:
          "CONFIRMATION_REVALIDATION_FAILED",
        detail:
          confirmedSafetyResult.status || null
      };
    }


    // -----------------------------------------
    // 5. EXECUTE FRESH TARGET
    // -----------------------------------------

    return executeAction(
      agentAction,
      confirmedSafetyResult.element
    );
  }


  // -----------------------------------------
  // 6. SAFE EXECUTION
  // -----------------------------------------

  return executeAction(
    agentAction,
    safetyResult.element
  );
}