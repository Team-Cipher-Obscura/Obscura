import { evaluateAction } from "./safetyGate.js";
import { executeAction } from "./executor.js";

export function processAction(agentAction) {

  // -----------------------------------------
  // 1. SAFETY GATE
  // -----------------------------------------

  const safetyResult =
    evaluateAction(agentAction);


  // -----------------------------------------
  // 2. BLOCKED
  // -----------------------------------------

  if (safetyResult.decision === "BLOCK") {
    return {
      status: "BLOCKED",
      action: agentAction?.action || null,
      target_id: agentAction?.target_id || null,
      reason: safetyResult.reason || safetyResult.status
    };
  }


  // -----------------------------------------
  // 3. CONFIRMATION REQUIRED
  // -----------------------------------------

  if (safetyResult.decision === "CONFIRM") {
    return {
      status: "CONFIRMATION_PENDING",
      action: agentAction?.action || null,
      target_id: agentAction?.target_id || null,
      reason: safetyResult.reason || safetyResult.status
    };
  }


  // -----------------------------------------
  // 4. EXECUTE
  // -----------------------------------------

  return executeAction(
    agentAction,
    safetyResult.element
  );
}

//execute confirmed action
export function executeConfirmedAction(agentAction, element) {
  return executeAction(
    agentAction,
    element
  );
}