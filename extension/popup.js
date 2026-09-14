/* =========================================================
   OBSCURA POPUP
   P1 UI Controller
   ========================================================= */

const DEFAULT_STATE = {
  status: "Idle. Enter a task and click start.",
  statusType: "idle",

  captureRunning: false,

  piiDetected: 0,
  redacted: 0,
  sentToAI: 0,

  originalScreenshot: null,
  redactedScreenshot: null
};


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const taskInput = document.getElementById("task-input");

const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");

const statusBar = document.getElementById("status-bar");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const headerStatusDot =
  document.getElementById("header-status-dot");

const piiCount =
  document.getElementById("pii-count");

const redactedCount =
  document.getElementById("redacted-count");

const sentCount =
  document.getElementById("sent-count");

const originalPreview =
  document.getElementById("original-preview");

const redactedPreview =
  document.getElementById("redacted-preview");

const originalPlaceholder =
  document.getElementById("original-placeholder");

const redactedPlaceholder =
  document.getElementById("redacted-placeholder");


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  await restoreState();

  setupEventListeners();
});


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {

  startBtn.addEventListener("click", startCapture);

  stopBtn.addEventListener("click", stopCapture);


  /*
   * Allow Enter to start the task.
   */
  taskInput.addEventListener("keydown", (event) => {

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (!startBtn.disabled) {
      startCapture();
    }
  });


  /*
   * Receive updates from background.js.
   */
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

      if (!message || !message.type) {
        return false;
      }

      handleBackgroundMessage(message);

      return false;
    }
  );
}


/* =========================================================
   START
   ========================================================= */

async function startCapture() {

  const task = taskInput.value.trim();

  if (!task) {

    setStatus(
      "Please enter a task first.",
      "error"
    );

    taskInput.focus();

    return;
  }


  /*
   * Optimistically update UI.
   */
  setRunningState(true);

  setStatus(
    "Starting capture cycle…",
    "running"
  );


  try {

    const response =
      await chrome.runtime.sendMessage({
        type: "START_CAPTURE",
        task
      });


    /*
     * Some background implementations may not return
     * a response. Therefore only treat an explicit
     * failure as an error.
     */
    if (response && response.valid === false) {

      setRunningState(false);

      setStatus(
        response.error || "Unable to start capture.",
        "error"
      );

      return;
    }


    /*
     * Save task locally so popup reopening does not
     * immediately lose the entered task.
     */
    await chrome.storage.local.set({
      obscura_task: task
    });

  } catch (error) {

    console.error(
      "Failed to start Obscura:",
      error
    );

    setRunningState(false);

    setStatus(
      "Could not start capture.",
      "error"
    );
  }
}


/* =========================================================
   STOP
   ========================================================= */

async function stopCapture() {

  setStatus(
    "Stopping capture…",
    "running"
  );


  try {

    const response =
      await chrome.runtime.sendMessage({
        type: "STOP_CAPTURE"
      });


    if (response && response.valid === false) {

      setStatus(
        response.error || "Unable to stop capture.",
        "error"
      );

      return;
    }


    setRunningState(false);

    setStatus(
      "Capture stopped.",
      "idle"
    );

  } catch (error) {

    console.error(
      "Failed to stop Obscura:",
      error
    );

    setRunningState(false);

    setStatus(
      "Capture stopped.",
      "idle"
    );
  }
}


/* =========================================================
   BACKGROUND MESSAGE HANDLER
   ========================================================= */

function handleBackgroundMessage(message) {

  switch (message.type) {


    /* ---------------------------------------------
       REDACTED PREVIEW
       --------------------------------------------- */

    case "REDACTED_PREVIEW":

      handleRedactedPreview(message);

      break;


    /* ---------------------------------------------
       CAPTURE STARTED
       --------------------------------------------- */

    case "CAPTURE_STARTED":

      setRunningState(true);

      setStatus(
        message.status || "Capture cycle running…",
        "running"
      );

      break;


    /* ---------------------------------------------
       CAPTURE STOPPED
       --------------------------------------------- */

    case "CAPTURE_STOPPED":

      setRunningState(false);

      setStatus(
        message.status || "Capture stopped.",
        "idle"
      );

      break;


    /* ---------------------------------------------
       STATUS UPDATE
       --------------------------------------------- */

    case "STATUS_UPDATE":

      if (typeof message.status === "string") {

        setStatus(
          message.status,
          normalizeStatusType(message.statusType)
        );
      }

      if (
        message.captureRunning !== undefined
      ) {

        setRunningState(
          Boolean(message.captureRunning)
        );
      }

      updateCountersFromMessage(message);

      break;


    /* ---------------------------------------------
       PRIVACY UPDATE
       --------------------------------------------- */

    case "PRIVACY_UPDATE":

      updateCountersFromMessage(message);

      break;


    /* ---------------------------------------------
       ACTION RESULT
       --------------------------------------------- */

    case "P6_ACTION_RESULT":

      handleActionResult(message);

      break;


    default:
      break;
  }
}


/* =========================================================
   REDACTED PREVIEW
   ========================================================= */

function handleRedactedPreview(message) {

  /*
   * Your existing background.js sends the latest
   * original and redacted screenshots to the popup.
   */

  const original =
    message.originalScreenshot ||
    message.original ||
    null;

  const redacted =
    message.redactedScreenshot ||
    message.redacted ||
    null;


  if (original) {
    showPreview(
      originalPreview,
      originalPlaceholder,
      original
    );
  }


  if (redacted) {
    showPreview(
      redactedPreview,
      redactedPlaceholder,
      redacted
    );
  }


  /*
   * Update privacy counters if supplied with
   * the preview message.
   */
  updateCountersFromMessage(message);


  /*
   * Persist only the UI state needed to restore
   * the popup.
   */
  saveState();
}


/* =========================================================
   SHOW PREVIEW
   ========================================================= */

function showPreview(
  imageElement,
  placeholderElement,
  imageData
) {

  const normalized =
    normalizeImageData(imageData);

  if (!normalized) {
    return;
  }


  imageElement.src = normalized;

  imageElement.classList.remove("hidden");

  placeholderElement.style.display = "none";
}


/* =========================================================
   IMAGE NORMALIZATION
   ========================================================= */

function normalizeImageData(value) {

  if (!value) {
    return null;
  }


  /*
   * Already a data URL.
   */
  if (
    typeof value === "string" &&
    value.startsWith("data:")
  ) {

    return value;
  }


  /*
   * Base64 PNG/JPEG without data URL prefix.
   */
  if (
    typeof value === "string" &&
    /^[A-Za-z0-9+/=\s]+$/.test(value)
  ) {

    return `data:image/png;base64,${value}`;
  }


  /*
   * Blob/File-like objects are not expected from
   * runtime messaging, but keep this safe.
   */
  return null;
}


/* =========================================================
   COUNTERS
   ========================================================= */

function updateCountersFromMessage(message) {

  if (!message) {
    return;
  }


  /*
   * Support direct counter fields.
   */
  if (
    typeof message.piiDetected === "number"
  ) {

    setCounter(
      piiCount,
      message.piiDetected
    );
  }


  if (
    typeof message.pii_detected_count === "number"
  ) {

    setCounter(
      piiCount,
      message.pii_detected_count
    );
  }


  if (
    typeof message.redacted === "number"
  ) {

    setCounter(
      redactedCount,
      message.redacted
    );
  }


  if (
    typeof message.redacted_count === "number"
  ) {

    setCounter(
      redactedCount,
      message.redacted_count
    );
  }


  if (
    typeof message.sentToAI === "number"
  ) {

    setCounter(
      sentCount,
      message.sentToAI
    );
  }


  if (
    typeof message.sent_to_ai_count === "number"
  ) {

    setCounter(
      sentCount,
      message.sent_to_ai_count
    );
  }


  /*
   * Support a nested privacy payload from P3.
   */
  if (message.privacy_status) {

    if (
      typeof message.pii_detected_count === "number"
    ) {

      setCounter(
        piiCount,
        message.pii_detected_count
      );
    }

    if (
      typeof message.redacted_count === "number"
    ) {

      setCounter(
        redactedCount,
        message.redacted_count
      );
    }

    if (
      typeof message.sent_to_ai_count === "number"
    ) {

      setCounter(
        sentCount,
        message.sent_to_ai_count
      );
    }
  }


  /*
   * Support:
   *
   * {
   *   counters: {
   *      piiDetected,
   *      redacted,
   *      sentToAI
   *   }
   * }
   */
  if (message.counters) {

    const counters = message.counters;


    if (
      typeof counters.piiDetected === "number"
    ) {

      setCounter(
        piiCount,
        counters.piiDetected
      );
    }


    if (
      typeof counters.redacted === "number"
    ) {

      setCounter(
        redactedCount,
        counters.redacted
      );
    }


    if (
      typeof counters.sentToAI === "number"
    ) {

      setCounter(
        sentCount,
        counters.sentToAI
      );
    }
  }


  saveState();
}


function setCounter(element, value) {

  const safeValue =
    Number.isFinite(Number(value))
      ? Math.max(0, Number(value))
      : 0;

  element.textContent =
    String(safeValue);
}


/* =========================================================
   ACTION RESULT
   ========================================================= */

function handleActionResult(message) {

  const result =
    message.result ||
    message;


  if (!result) {
    return;
  }


  switch (result.status) {

    case "EXECUTED":

      setStatus(
        "Action executed. Continuing…",
        "running"
      );

      break;


    case "CONFIRMATION_PENDING":

      setStatus(
        "Waiting for your confirmation…",
        "paused"
      );

      break;


    case "BLOCKED":

      setStatus(
        result.reason ||
        "Action blocked for safety.",
        "error"
      );

      break;


    case "FAILED":

      setStatus(
        result.reason ||
        "Action failed.",
        "error"
      );

      break;


    default:
      break;
  }
}


/* =========================================================
   RUNNING STATE
   ========================================================= */

function setRunningState(isRunning) {

  const running =
    Boolean(isRunning);


  startBtn.disabled = running;

  stopBtn.disabled = !running;

  taskInput.disabled = running;


  if (running) {

    headerStatusDot.classList.remove(
      "idle",
      "error"
    );

    headerStatusDot.classList.add(
      "running"
    );

  } else {

    headerStatusDot.classList.remove(
      "running",
      "error"
    );

    headerStatusDot.classList.add(
      "idle"
    );
  }


  saveState();
}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(
  text,
  type = "idle"
) {

  statusText.textContent =
    text || DEFAULT_STATE.status;


  statusBar.classList.remove(
    "idle",
    "running",
    "success",
    "error",
    "paused"
  );

  statusBar.classList.add(
    type
  );


  headerStatusDot.classList.remove(
    "idle",
    "running",
    "error"
  );


  if (type === "running") {

    headerStatusDot.classList.add(
      "running"
    );

  } else if (type === "error") {

    headerStatusDot.classList.add(
      "error"
    );

  } else {

    headerStatusDot.classList.add(
      "idle"
    );
  }


  saveState();
}


function normalizeStatusType(type) {

  const validTypes = [
    "idle",
    "running",
    "success",
    "error",
    "paused"
  ];


  return validTypes.includes(type)
    ? type
    : "idle";
}


/* =========================================================
   STATE RESTORATION
   ========================================================= */

async function restoreState() {

  try {

    const stored =
      await chrome.storage.local.get([
        "obscura_task",
        "obscura_status",
        "obscura_status_type",
        "obscura_capture_running",
        "obscura_pii_detected",
        "obscura_redacted",
        "obscura_sent_to_ai",
        "obscura_original_preview",
        "obscura_redacted_preview"
      ]);


    if (stored.obscura_task) {

      taskInput.value =
        stored.obscura_task;
    }


    const running =
      Boolean(
        stored.obscura_capture_running
      );


    setRunningState(running);


    if (stored.obscura_status) {

      setStatus(
        stored.obscura_status,
        normalizeStatusType(
          stored.obscura_status_type
        )
      );
    }


    if (
      typeof stored.obscura_pii_detected ===
      "number"
    ) {

      setCounter(
        piiCount,
        stored.obscura_pii_detected
      );
    }


    if (
      typeof stored.obscura_redacted ===
      "number"
    ) {

      setCounter(
        redactedCount,
        stored.obscura_redacted
      );
    }


    if (
      typeof stored.obscura_sent_to_ai ===
      "number"
    ) {

      setCounter(
        sentCount,
        stored.obscura_sent_to_ai
      );
    }


    if (stored.obscura_original_preview) {

      showPreview(
        originalPreview,
        originalPlaceholder,
        stored.obscura_original_preview
      );
    }


    if (stored.obscura_redacted_preview) {

      showPreview(
        redactedPreview,
        redactedPlaceholder,
        stored.obscura_redacted_preview
      );
    }


  } catch (error) {

    console.error(
      "Could not restore Obscura popup state:",
      error
    );
  }
}


/* =========================================================
   STATE PERSISTENCE
   ========================================================= */

async function saveState() {

  try {

    const pii =
      Number(piiCount.textContent) || 0;

    const redacted =
      Number(redactedCount.textContent) || 0;

    const sent =
      Number(sentCount.textContent) || 0;


    await chrome.storage.local.set({

      obscura_task:
        taskInput.value.trim(),

      obscura_status:
        statusText.textContent,

      obscura_status_type:
        getCurrentStatusType(),

      obscura_capture_running:
        !stopBtn.disabled,

      obscura_pii_detected:
        pii,

      obscura_redacted:
        redacted,

      obscura_sent_to_ai:
        sent
    });


  } catch (error) {

    console.error(
      "Could not save Obscura popup state:",
      error
    );
  }
}


function getCurrentStatusType() {

  const classes =
    statusBar.classList;


  if (classes.contains("running")) {
    return "running";
  }

  if (classes.contains("success")) {
    return "success";
  }

  if (classes.contains("error")) {
    return "error";
  }

  if (classes.contains("paused")) {
    return "paused";
  }

  return "idle";
}


/* =========================================================
   STORAGE LISTENER
   ========================================================= */

chrome.storage.onChanged.addListener(
  (changes, areaName) => {

    if (areaName !== "local") {
      return;
    }


    if (
      changes.obscura_status &&
      changes.obscura_status.newValue !== undefined
    ) {

      setStatus(
        changes.obscura_status.newValue,
        normalizeStatusType(
          changes.obscura_status_type?.newValue
        )
      );
    }


    if (
      changes.obscura_capture_running &&
      changes.obscura_capture_running.newValue !== undefined
    ) {

      setRunningState(
        Boolean(
          changes.obscura_capture_running.newValue
        )
      );
    }


    if (
      changes.obscura_pii_detected &&
      typeof changes.obscura_pii_detected.newValue ===
      "number"
    ) {

      setCounter(
        piiCount,
        changes.obscura_pii_detected.newValue
      );
    }


    if (
      changes.obscura_redacted &&
      typeof changes.obscura_redacted.newValue ===
      "number"
    ) {

      setCounter(
        redactedCount,
        changes.obscura_redacted.newValue
      );
    }


    if (
      changes.obscura_sent_to_ai &&
      typeof changes.obscura_sent_to_ai.newValue ===
      "number"
    ) {

      setCounter(
        sentCount,
        changes.obscura_sent_to_ai.newValue
      );
    }
  }
);