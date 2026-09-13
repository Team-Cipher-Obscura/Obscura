import {
  P6_CONFIRMATION_REQUEST,
  P6_CONFIRMATION_RESPONSE
} from "./messageTypes.js";


const CONFIRMATION_TIMEOUT_MS =
  30000;


const pendingRequests =
  new Map();


/**
 * Request confirmation from P1.
 *
 * Production behavior:
 * - sends P6_CONFIRMATION_REQUEST
 * - waits for P6_CONFIRMATION_RESPONSE
 * - 30 seconds with no response => deny
 *
 * timeoutMs is intentionally injectable for tests.
 * Production callers use the default 30-second timeout.
 */
export function requestConfirmation({
  sendMessage,
  action,
  targetSummary,
  timeoutMs = CONFIRMATION_TIMEOUT_MS
}) {

  if (typeof sendMessage !== "function") {
    return Promise.resolve(false);
  }


  const requestId =
    crypto.randomUUID();


  return new Promise((resolve) => {

    let settled = false;


    const finish = (approved) => {

      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timeoutId);

      pendingRequests.delete(
        requestId
      );

      resolve(
        Boolean(approved)
      );
    };


    const timeoutId =
      setTimeout(() => {

        finish(false);

      }, timeoutMs);


    pendingRequests.set(
      requestId,
      {
        resolve: finish
      }
    );


    try {

      sendMessage({
        type:
          P6_CONFIRMATION_REQUEST,

        requestId,

        action,

        targetSummary
      });

    } catch {

      finish(false);
    }

  });
}


/**
 * Handle a P1 -> P6 confirmation response.
 */
export function handleConfirmationResponse(
  message
) {

  if (
    message?.type !==
    P6_CONFIRMATION_RESPONSE
  ) {
    return;
  }


  const requestId =
    message.requestId;


  if (!requestId) {
    return;
  }


  const pending =
    pendingRequests.get(
      requestId
    );


  if (!pending) {
    return;
  }


  pending.resolve(
    Boolean(message.approved)
  );
}


/**
 * Real extension message bridge.
 *
 * P1 sends P6_CONFIRMATION_RESPONSE through
 * chrome.runtime.sendMessage().
 *
 * The P6 module receives it here and routes it
 * into the pending confirmation promise.
 *
 * The listener is guarded so the same module can
 * continue to run inside standalone browser tests
 * where chrome.runtime does not exist.
 */
if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.runtime.onMessage &&
  typeof chrome.runtime.onMessage.addListener ===
    "function"
) {

  chrome.runtime.onMessage.addListener(
    (message) => {

      handleConfirmationResponse(
        message
      );

    }
  );
}


/**
 * Used by tests only.
 */
export function _pendingCountForTesting() {
  return pendingRequests.size;
}


/**
 * Used by tests only.
 *
 * Keeps the production timeout private while allowing
 * integration tests to exercise timeout behavior without
 * waiting 30 seconds.
 */
export const _CONFIRMATION_TIMEOUT_MS_FOR_TESTING =
  CONFIRMATION_TIMEOUT_MS;