import {
  P6_CONFIRMATION_REQUEST,
  P6_CONFIRMATION_RESPONSE
} from "./messageTypes.js";


const CONFIRMATION_TIMEOUT_MS = 30000;

const pendingRequests = new Map();


export function requestConfirmation({
  sendMessage,
  action,
  targetSummary
}) {

  const requestId =
    crypto.randomUUID();

  return new Promise((resolve) => {

    const timeoutId =
      setTimeout(() => {

        pendingRequests.delete(
          requestId
        );

        // No response = deny
        resolve(false);

      }, CONFIRMATION_TIMEOUT_MS);


    pendingRequests.set(
      requestId,
      {
        resolve: (approved) => {

          clearTimeout(timeoutId);

          resolve(approved);
        }
      }
    );


    sendMessage({
      type: P6_CONFIRMATION_REQUEST,
      requestId,
      action,
      targetSummary
    });

  });
}


export function handleConfirmationResponse(
  message
) {

  if (
    message?.type !==
    P6_CONFIRMATION_RESPONSE
  ) {
    return;
  }


  const pending =
    pendingRequests.get(
      message.requestId
    );


  if (!pending) {
    return;
  }


  pendingRequests.delete(
    message.requestId
  );


  pending.resolve(
    Boolean(message.approved)
  );
}


export function _pendingCountForTesting() {
  return pendingRequests.size;
}