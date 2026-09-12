// popup.js
// Owns only the UI. All real work happens in background.js.
// The popup can close at any time, so it does not hold application state.

const taskInput = document.getElementById("taskInput");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

const piiCountEl = document.getElementById("piiCount");
const redactedCountEl = document.getElementById("redactedCount");
const sentCountEl = document.getElementById("sentCount");


// --------------------------------------------------
// Start capture cycle
// --------------------------------------------------

startBtn.addEventListener("click", () => {
  const task = taskInput.value.trim();

  if (!task) {
    statusEl.textContent = "Enter a task first.";
    return;
  }

  statusEl.textContent = "Starting capture cycle...";

  chrome.runtime.sendMessage({
    type: "START_CAPTURE",
    task: task
  });
});


// --------------------------------------------------
// Receive status/counter updates
// --------------------------------------------------

chrome.runtime.onMessage.addListener((message) => {

  if (message.type === "STATUS_UPDATE") {
    statusEl.textContent = message.status;
  }

  if (message.type === "PRIVACY_COUNTERS") {
    piiCountEl.textContent =
      message.pii_detected_count ?? 0;

    redactedCountEl.textContent =
      message.redacted_count ?? 0;

    sentCountEl.textContent =
      message.sent_to_ai_count ?? 0;
  }
});