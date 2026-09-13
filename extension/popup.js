// popup.js
// P1 — Popup UI
//
// The popup only displays state.
// Capture coordination remains in background.js.
//
// Messages received:
//   STATUS_UPDATE
//   PRIVACY_COUNTERS
//   REDACTED_PREVIEW


// --------------------------------------------------
// DOM elements
// --------------------------------------------------

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

const originalPreviewEl =
  document.getElementById("originalPreview");

const redactedPreviewEl =
  document.getElementById("redactedPreview");


// --------------------------------------------------
// Start capture loop
// --------------------------------------------------

startBtn.addEventListener("click", () => {

  const task =
    taskInput.value.trim();


  if (!task) {

    statusEl.textContent =
      "Enter a task first.";

    return;
  }


  statusEl.textContent =
    "Starting capture cycle...";


  chrome.runtime.sendMessage({

    type:
      "START_CAPTURE",

    task
  });
});


// --------------------------------------------------
// Stop capture loop
// --------------------------------------------------

stopBtn.addEventListener("click", () => {

  chrome.runtime.sendMessage({

    type:
      "STOP_CAPTURE"
  });
});


// --------------------------------------------------
// Receive updates from background.js
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message) => {

    if (!message) {
      return;
    }


    // ----------------------------------------------
    // Status
    // ----------------------------------------------

    if (
      message.type ===
      "STATUS_UPDATE"
    ) {

      statusEl.textContent =
        message.status;
    }


    // ----------------------------------------------
    // Privacy counters
    // ----------------------------------------------

    if (
      message.type ===
      "PRIVACY_COUNTERS"
    ) {

      piiCountEl.textContent =
        message.pii_detected_count ?? 0;


      redactedCountEl.textContent =
        message.redacted_count ?? 0;


      sentCountEl.textContent =
        message.sent_to_ai_count ?? 0;
    }


    // ----------------------------------------------
    // Original + redacted screenshots
    //
    // P1 original = PNG data URL
    // P3 redacted = bare base64 PNG
    // ----------------------------------------------

    if (
      message.type ===
      "REDACTED_PREVIEW"
    ) {

      if (
        originalPreviewEl &&
        message.original_screenshot
      ) {

        originalPreviewEl.src =
          message.original_screenshot.startsWith("data:")
            ? message.original_screenshot
            : `data:image/png;base64,${message.original_screenshot}`;
      }


      if (
        redactedPreviewEl &&
        message.redacted_screenshot
      ) {

        redactedPreviewEl.src =
          message.redacted_screenshot.startsWith("data:")
            ? message.redacted_screenshot
            : `data:image/png;base64,${message.redacted_screenshot}`;
      }
    }
  }
);