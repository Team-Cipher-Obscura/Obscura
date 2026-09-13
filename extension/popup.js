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
    type: "START_CAPTURE",
    task: task
  });
});


// --------------------------------------------------
// Stop capture loop
// --------------------------------------------------

stopBtn.addEventListener("click", () => {

  chrome.runtime.sendMessage({
    type: "STOP_CAPTURE"
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
      message.type === "STATUS_UPDATE"
    ) {

      statusEl.textContent =
        message.status;
    }


    // ----------------------------------------------
    // Privacy counters
    //
    // Expected format:
    //
    // {
    //   type: "PRIVACY_COUNTERS",
    //   cycle_id,
    //   privacy_status,
    //   pii_detected_count,
    //   redacted_count,
    //   sensitive_types,
    //   sent_to_ai_count
    // }
    // ----------------------------------------------

    if (
      message.type === "PRIVACY_COUNTERS"
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
    // ----------------------------------------------

    if (
      message.type === "REDACTED_PREVIEW"
    ) {

      if (
        message.original_screenshot
      ) {

        originalPreviewEl.src =
          `data:image/png;base64,${message.original_screenshot}`;
      }


      if (
        message.redacted_screenshot
      ) {

        redactedPreviewEl.src =
          `data:image/png;base64,${message.redacted_screenshot}`;
      }
    }
  }
);