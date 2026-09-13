import {
  evaluateAction
} from "./safetyGate.js";

import {
  executeAction
} from "./executor.js";

import {
  requestConfirmation
} from "./confirmationFlow.js";

import {
  validateAgentAction
} from "./hardening/actionValidation.js";

import {
  logger
} from "./hardening/logger.js";


function pipelineResult(
  status,
  action,
  reason = null,
  detail = null
) {
  return {
    status,
    action:
      action?.action ?? null,
    target_id:
      action?.target_id ?? null,
    reason,
    detail
  };
}


/**
 * Final P6 action boundary.
 *
 * P5 actions MUST enter here before execution.
 */
export async function processAction(
  action
) {

  const startedAt =
    performance.now();


  logger.action(
    "action_received",
    action
  );


  // --------------------------------------------------
  // 1. Validate P5 contract
  // --------------------------------------------------

  const validation =
    validateAgentAction(
      action
    );


  if (!validation.valid) {

    logger.warn(
      "pipeline_action_rejected",
      {
        reason:
          validation.reason,

        action:
          logger.sanitizeAction(
            action
          )
      }
    );

    return pipelineResult(
      "BLOCKED",
      action,
      validation.reason,
      validation.reason
    );
  }


  // --------------------------------------------------
  // 2. First safety evaluation
  // --------------------------------------------------

  const safetyStartedAt =
    performance.now();

  const safety =
    evaluateAction(
      action
    );

  const safetyDuration =
    performance.now() -
    safetyStartedAt;


  logger.debug(
    "pipeline_safety_completed",
    {
      action:
        action.action,

      target_id:
        action.target_id,

      decision:
        safety.decision,

      status:
        safety.status,

      duration_ms:
        Number(
          safetyDuration.toFixed(3)
        )
    }
  );


  // --------------------------------------------------
  // 3. Hard block
  // --------------------------------------------------

  if (
    safety.decision === "BLOCK"
  ) {

    logger.warn(
      "pipeline_safety_block",
      {
        action:
          action.action,

        target_id:
          action.target_id,

        reason:
          safety.reason,

        detail:
          safety.status
      }
    );

    return pipelineResult(
      "BLOCKED",
      action,
      safety.reason,
      safety.status
    );
  }


  // --------------------------------------------------
  // 4. Confirmation
  // --------------------------------------------------

  if (
    safety.decision === "CONFIRM"
  ) {

    logger.info(
      "pipeline_confirmation_started",
      {
        action:
          action.action,

        target_id:
          action.target_id
      }
    );


    const confirmationStartedAt =
      performance.now();


    let confirmation;

    try {

      confirmation =
        await requestConfirmation(
          action
        );

    } catch (error) {

      logger.error(
        "confirmation_request_failed",
        {
          error:
            error instanceof Error
              ? error.message
              : "unknown"
        }
      );

      return pipelineResult(
        "CONFIRMATION_PENDING",
        action,
        "CONFIRMATION_ERROR",
        "CONFIRMATION_ERROR"
      );
    }


    const confirmationDuration =
      performance.now() -
      confirmationStartedAt;


    logger.info(
      "pipeline_confirmation_completed",
      {
        action:
          action.action,

        target_id:
          action.target_id,

        approved:
          Boolean(
            confirmation?.approved
          ),

        duration_ms:
          Number(
            confirmationDuration
              .toFixed(3)
          )
      }
    );


    if (
      !confirmation?.approved
    ) {

      return pipelineResult(
        "BLOCKED",
        action,
        confirmation?.reason ||
          "CONFIRMATION_REJECTED",
        "CONFIRMATION_REJECTED"
      );
    }


    // --------------------------------------------------
    // 5. CRITICAL:
    // Fresh safety evaluation after approval.
    //
    // Do NOT reuse safety.element.
    // Do NOT reuse a stale DOM reference.
    // --------------------------------------------------

    logger.info(
      "pipeline_confirmation_recheck_started",
      {
        action:
          action.action,

        target_id:
          action.target_id
      }
    );


    const recheck =
      evaluateAction(
        action,
        {
          confirmationGranted:
            true
        }
      );


    if (
      recheck.decision !==
      "EXECUTE"
    ) {

      logger.warn(
        "pipeline_confirmation_recheck_blocked",
        {
          action:
            action.action,

          target_id:
            action.target_id,

          decision:
            recheck.decision,

          status:
            recheck.status,

          reason:
            recheck.reason
        }
      );


      return pipelineResult(
        "BLOCKED",
        action,
        recheck.reason ||
          "SAFETY_RECHECK_FAILED",
        recheck.status
      );
    }


    // --------------------------------------------------
    // 6. Execute using the FRESH safety result
    // --------------------------------------------------

    const execution =
      executeAction(
        action,
        recheck.element
      );


    logger.info(
      "pipeline_execution_completed",
      {
        action:
          action.action,

        target_id:
          action.target_id,

        execution_status:
          execution.status
      }
    );


    return execution;
  }


  // --------------------------------------------------
  // 7. Directly safe action
  // --------------------------------------------------

  if (
    safety.decision === "EXECUTE"
  ) {

    const execution =
      executeAction(
        action,
        safety.element
      );


    logger.info(
      "pipeline_execution_completed",
      {
        action:
          action.action,

        target_id:
          action.target_id,

        execution_status:
          execution.status
      }
    );


    return execution;
  }


  // --------------------------------------------------
  // 8. Defensive fallback
  // --------------------------------------------------

  logger.error(
    "pipeline_unknown_safety_decision",
    {
      decision:
        safety.decision,

      action:
        action.action
    }
  );


  return pipelineResult(
    "BLOCKED",
    action,
    "UNKNOWN_SAFETY_DECISION",
    safety.decision
  );
}