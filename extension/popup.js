// popup.js
// Obscura — P1 Popup UI
//
// Responsibilities:
//   - Collect task
//   - Start / stop P1 capture loop
//   - Display P1 status
//   - Display privacy counters
//   - Display original + redacted screenshots
//   - Handle P6 confirmation requests
//
// Capture coordination remains in background.js.


// ==================================================
// DOM ELEMENTS
// ==================================================

const taskInput =
  document.getElementById("taskInput");

const startBtn =
  document.getElementById("startBtn");

const stopBtn =
  document.getElementById("stopBtn");

const statusEl =
  document.getElementById("status");

const piiCountEl =
  document.getElementById("piiCount");

const redactedCountEl =
  document.getElementById("redactedCount");

const sentCountEl =
  document.getElementById("sentCount");

const liveDot =
  document.getElementById("liveDot");

const originalPreviewEl =
  document.getElementById("originalPreview");

const redactedPreviewEl =
  document.getElementById("redactedPreview");

const originalPlaceholderEl =
  document.getElementById("originalPlaceholder");

const redactedPlaceholderEl =
  document.getElementById("redactedPlaceholder");


// P6 confirmation UI

const confirmationEl =
  document.getElementById("confirmation");

const confirmationTextEl =
  document.getElementById("confirmationText");

const approveBtn =
  document.getElementById("approveBtn");

const denyBtn =
  document.getElementById("denyBtn");


// ==================================================
// LOCAL STATE
// ==================================================

let captureRunning = false;

let pendingConfirmationId = null;


// ==================================================
// INITIAL UI
// ==================================================

setStatus(
  "Idle. Enter a task and click start."
);

setLiveState(false);

updateButtonState();

hideConfirmation();


// ==================================================
// STATUS
// ==================================================

function setStatus(message) {

  if (!statusEl) {
    return;
  }

  statusEl.textContent =
    message || "";
}


// ==================================================
// LIVE DOT
// ==================================================

function setLiveState(
  active,
  warning = false
) {

  if (!liveDot) {
    return;
  }

  liveDot.classList.remove(
    "active",
    "warning"
  );

  if (warning) {

    liveDot.classList.add(
      "warning"
    );

    liveDot.title =
      "Attention required";

    return;
  }

  if (active) {

    liveDot.classList.add(
      "active"
    );

    liveDot.title =
      "Capture active";

    return;
  }

  liveDot.title =
    "Idle";
}


// ==================================================
// BUTTON STATE
// ==================================================

function updateButtonState() {

  if (startBtn) {

    startBtn.disabled =
      captureRunning;
  }

  if (stopBtn) {

    stopBtn.disabled =
      !captureRunning;
  }
}


// ==================================================
// START
// ==================================================

if (startBtn) {

  startBtn.addEventListener(
    "click",
    () => {

      const task =
        taskInput?.value.trim();


      if (!task) {

        setStatus(
          "Enter a task first."
        );

        taskInput?.focus();

        return;
      }


      captureRunning =
        true;

      updateButtonState();

      setLiveState(true);


      setStatus(
        "Starting capture cycle..."
      );


      chrome.runtime.sendMessage({

        type:
          "START_CAPTURE",

        task

      }).catch((error) => {

        console.error(
          "[Obscura Popup] Start failed:",
          error
        );


        captureRunning =
          false;

        updateButtonState();

        setLiveState(false);


        setStatus(
          "Unable to start capture cycle."
        );
      });
    }
  );
}


// ==================================================
// STOP
// ==================================================

if (stopBtn) {

  stopBtn.addEventListener(
    "click",
    () => {

      chrome.runtime.sendMessage({

        type:
          "STOP_CAPTURE"

      }).catch((error) => {

        console.error(
          "[Obscura Popup] Stop failed:",
          error
        );
      });


      captureRunning =
        false;

      updateButtonState();

      setLiveState(false);


      setStatus(
        "Stopping capture cycle..."
      );
    }
  );
}


// ==================================================
// P6 — APPROVE
// ==================================================

if (approveBtn) {

  approveBtn.addEventListener(
    "click",
    () => {

      respondToConfirmation(true);
    }
  );
}


// ==================================================
// P6 — DENY
// ==================================================

if (denyBtn) {

  denyBtn.addEventListener(
    "click",
    () => {

      respondToConfirmation(false);
    }
  );
}


// ==================================================
// P6 CONFIRMATION RESPONSE
// ==================================================

function respondToConfirmation(
  approved
) {

  if (!pendingConfirmationId) {
    return;
  }


  const requestId =
    pendingConfirmationId;


  pendingConfirmationId =
    null;


  hideConfirmation();


  setLiveState(
    captureRunning
  );


  setStatus(
    approved
      ? "Confirmation approved."
      : "Confirmation denied."
  );


  chrome.runtime.sendMessage({

    type:
      "P6_CONFIRMATION_RESPONSE",

    requestId,

    approved

  }).catch((error) => {

    console.error(
      "[Obscura Popup] Confirmation response failed:",
      error
    );


    setStatus(
      "Failed to send confirmation response."
    );
  });
}


// ==================================================
// SHOW CONFIRMATION
// ==================================================

function showConfirmation(
  message
) {

  if (confirmationTextEl) {

    confirmationTextEl.textContent =
      message ||
      "An action requires your confirmation.";
  }


  if (confirmationEl) {

    confirmationEl.hidden =
      false;

    confirmationEl.style.display =
      "";
  }


  setLiveState(
    false,
    true
  );
}


// ==================================================
// HIDE CONFIRMATION
// ==================================================

function hideConfirmation() {

  if (confirmationEl) {

    confirmationEl.hidden =
      true;

    confirmationEl.style.display =
      "none";
  }
}


// ==================================================
// IMAGE PREVIEW
// ==================================================

function setPreview(
  imageElement,
  placeholderElement,
  imageData,
  defaultMime = "image/png"
) {

  if (
    !imageElement ||
    !imageData
  ) {
    return;
  }


  let src;


  // Already a data URL.
  if (
    typeof imageData === "string" &&
    imageData.startsWith("data:")
  ) {

    src =
      imageData;

  } else {

    // Bare base64.
    src =
      `data:${defaultMime};base64,${imageData}`;
  }


  imageElement.onload = () => {

    if (placeholderElement) {

      placeholderElement.style.display =
        "none";
    }
  };


  imageElement.onerror = () => {

    if (placeholderElement) {

      placeholderElement.style.display =
        "flex";
    }
  };


  imageElement.src =
    src;
}


// ==================================================
// RECEIVE BACKGROUND MESSAGES
// ==================================================

chrome.runtime.onMessage.addListener(
  (message) => {

    if (!message) {
      return;
    }


    // ==============================================
    // STATUS UPDATE
    // ==============================================

    if (
      message.type ===
      "STATUS_UPDATE"
    ) {

      const status =
        message.status || "";


      setStatus(
        status
      );


      const normalized =
        status.toLowerCase();


      // Active pipeline states.
      if (
        normalized.includes("started") ||
        normalized.includes("capturing") ||
        normalized.includes("sending") ||
        normalized.includes("action:")
      ) {

        captureRunning =
          true;

        setLiveState(true);
      }


      // Stopped / cancelled states.
      if (
        normalized.includes("stopped") ||
        normalized.includes("cancelled") ||
        normalized.includes("canceled")
      ) {

        captureRunning =
          false;

        setLiveState(false);
      }


      // Attention states.
      if (
        normalized.includes("failed") ||
        normalized.includes("blocked") ||
        normalized.includes("confirmation")
      ) {

        setLiveState(
          false,
          true
        );
      }


      updateButtonState();
    }


    // ==============================================
    // PRIVACY COUNTERS
    // ==============================================

    if (
      message.type ===
      "PRIVACY_COUNTERS"
    ) {

      if (piiCountEl) {

        piiCountEl.textContent =
          String(
            message.pii_detected_count ?? 0
          );
      }


      if (redactedCountEl) {

        redactedCountEl.textContent =
          String(
            message.redacted_count ?? 0
          );
      }


      if (sentCountEl) {

        sentCountEl.textContent =
          String(
            message.sent_to_ai_count ?? 0
          );
      }
    }


    // ==============================================
    // REDACTED PREVIEW
    // ==============================================

    if (
      message.type ===
      "REDACTED_PREVIEW"
    ) {

      setPreview(

        originalPreviewEl,

        originalPlaceholderEl,

        message.original_screenshot,

        "image/png"
      );


      setPreview(

        redactedPreviewEl,

        redactedPlaceholderEl,

        message.redacted_screenshot,

        "image/png"
      );
    }


    // ==============================================
    // P6 CONFIRMATION REQUEST
    // ==============================================

    if (
      message.type ===
      "P6_CONFIRMATION_REQUEST"
    ) {

      if (!message.requestId) {

        console.warn(
          "[Obscura Popup] Confirmation request missing requestId."
        );

        return;
      }


      pendingConfirmationId =
        message.requestId;


      const targetSummary =
        message.targetSummary ||
        "Obscura wants to perform an action.";


      showConfirmation(
        targetSummary
      );


      setStatus(
        "Waiting for your confirmation."
      );
    }
  }
);