import {
  P6_CONFIRMATION_REQUEST,
  P6_CONFIRMATION_RESPONSE
} from "./messageTypes.js";

const CONFIRMATION_TIMEOUT_MS = 30000;

const pendingRequests = new Map();

let runtimeListenerRegistered = false;


/**
 * Returns the default browser message sender.
 *
 * Tests should inject their own sendMessage function.
 */
function getDefaultSendMessage() {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.sendMessage === "function"
  ) {
    return (message) => chrome.runtime.sendMessage(message);
  }

  throw new Error(
    "No confirmation message sender is available."
  );
}


/**
 * Extract a short, privacy-safe description of a DOM target.
 *
 * Never includes:
 *   - input values
 *   - page text in large quantities
 *   - password contents
 *   - arbitrary DOM HTML
 */
function buildTargetSummary(element) {
  if (!element) {
    return "This action changes the browser state.";
  }

  const tagName =
    (element.tagName || "element")
      .toLowerCase();

  const ariaLabel =
    element.getAttribute("aria-label");

  const title =
    element.getAttribute("title");

  const name =
    element.getAttribute("name");

  const id =
    element.getAttribute("id");

  const autocomplete =
    (
      element.getAttribute("autocomplete") ||
      ""
    ).toLowerCase();

  // Never expose values from password or credential fields.
  const isCredentialField =
    autocomplete === "current-password" ||
    autocomplete === "new-password" ||
    (
      (element.getAttribute("type") || "")
        .toLowerCase() === "password"
    );

  if (isCredentialField) {
    return `Password field (${tagName})`;
  }

  const label =
    ariaLabel ||
    title ||
    name ||
    id;

  if (label) {
    return String(label)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  return `Target element (${tagName})`;
}


/**
 * Build the payload used by the confirmation UI.
 *
 * This deliberately does NOT forward arbitrary action.metadata.
 *
 * In particular, model-produced values may contain:
 *   - passwords
 *   - typed text
 *   - tokens
 *   - payment information
 *   - other sensitive page data
 */
export function buildConfirmationPayload(
  action,
  element
) {
  if (!action || typeof action !== "object") {
    throw new TypeError(
      "Cannot build confirmation payload from invalid action."
    );
  }

  return {
    action: {
      action: action.action || null,
      target_id: action.target_id || null,
      confidence:
        typeof action.confidence === "number"
          ? action.confidence
          : null
    },

    targetSummary:
      buildTargetSummary(element)
  };
}


/**
 * Request user confirmation.
 *
 * IMPORTANT:
 * This preserves the Phase 4 API:
 *
 * requestConfirmation({
 *   sendMessage,
 *   action,
 *   targetSummary
 * })
 *
 * The promise resolves to:
 *
 *   true  -> approved
 *   false -> rejected or timed out
 */
export function requestConfirmation({
  sendMessage = getDefaultSendMessage(),
  action,
  targetSummary
}) {
  if (typeof sendMessage !== "function") {
    return Promise.reject(
      new TypeError(
        "sendMessage must be a function."
      )
    );
  }

  const requestId =
    (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    )
      ? crypto.randomUUID()
      : `p6-confirm-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (approved) => {
      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timeoutId);
      pendingRequests.delete(requestId);

      resolve(Boolean(approved));
    };

    const timeoutId =
      setTimeout(() => {
        settle(false);
      }, CONFIRMATION_TIMEOUT_MS);

    pendingRequests.set(
      requestId,
      {
        resolve: settle
      }
    );

    const message = {
      type: P6_CONFIRMATION_REQUEST,
      requestId,
      action,
      targetSummary
    };

    try {
      const sendResult =
        sendMessage(message);

      // Chrome's sendMessage can return a Promise.
      // We intentionally do not interpret its result as approval.
      //
      // User approval only comes from
      // P6_CONFIRMATION_RESPONSE.
      if (
        sendResult &&
        typeof sendResult.catch === "function"
      ) {
        sendResult.catch(() => {
          // A failed message delivery cannot approve an action.
          settle(false);
        });
      }
    } catch {
      // If the confirmation request cannot be delivered,
      // fail closed.
      settle(false);
    }
  });
}


/**
 * Handle P1 -> P6 confirmation responses.
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
    pendingRequests.get(requestId);

  if (!pending) {
    return;
  }

  pending.resolve(
    Boolean(message.approved)
  );
}


/**
 * Register the browser runtime listener.
 *
 * Safe to call more than once.
 *
 * Tests can simply call this after installing a mocked
 * chrome.runtime.onMessage implementation.
 */
export function registerConfirmationMessageListener() {
  if (runtimeListenerRegistered) {
    return;
  }

  if (
    typeof chrome === "undefined" ||
    !chrome.runtime ||
    !chrome.runtime.onMessage ||
    typeof chrome.runtime.onMessage.addListener !== "function"
  ) {
    return;
  }

  chrome.runtime.onMessage.addListener(
    (message) => {
      handleConfirmationResponse(message);
    }
  );

  runtimeListenerRegistered = true;
}


/**
 * Testing helper.
 */
export function _pendingCountForTesting() {
  return pendingRequests.size;
}


/**
 * Testing helper.
 *
 * Allows tests to reset the listener-registration state
 * without exposing the pending request map itself.
 */
export function _resetConfirmationListenerForTesting() {
  runtimeListenerRegistered = false;
}