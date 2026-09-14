/* =========================================================
   OBSCURA POPUP
   P1 UI CONTROLLER
   ========================================================= */


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const taskInput =
  document.getElementById("task-input");

const startBtn =
  document.getElementById("start-btn");

const stopBtn =
  document.getElementById("stop-btn");

const statusBar =
  document.getElementById("status-bar");

const statusText =
  document.getElementById("status-text");

const headerStatusDot =
  document.getElementById(
    "header-status-dot"
  );

const piiCount =
  document.getElementById("pii-count");

const redactedCount =
  document.getElementById(
    "redacted-count"
  );

const sentCount =
  document.getElementById(
    "sent-count"
  );

const originalPreview =
  document.getElementById(
    "original-preview"
  );

const redactedPreview =
  document.getElementById(
    "redacted-preview"
  );

const originalPlaceholder =
  document.getElementById(
    "original-placeholder"
  );

const redactedPlaceholder =
  document.getElementById(
    "redacted-placeholder"
  );


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    setupEventListeners();

    await restoreState();

  }
);


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function setupEventListeners() {

  startBtn.addEventListener(
    "click",
    startCapture
  );


  stopBtn.addEventListener(
    "click",
    stopCapture
  );


  taskInput.addEventListener(
    "keydown",
    (event) => {

      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      if (!startBtn.disabled) {
        startCapture();
      }

    }
  );


  chrome.runtime.onMessage.addListener(
    (message) => {

      if (!message?.type) {
        return;
      }

      handleBackgroundMessage(message);

    }
  );

}


/* =========================================================
   START CAPTURE
   ========================================================= */

async function startCapture() {

  const task =
    taskInput.value.trim();


  if (!task) {

    setStatus(
      "Please enter a task first.",
      "error"
    );

    taskInput.focus();

    return;

  }


  setRunning(true);


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


    if (response?.valid === false) {

      setRunning(false);

      setStatus(
        response.error ||
        "Unable to start capture.",
        "error"
      );

      return;

    }


    await chrome.storage.local.set({
      obscura_task: task
    });


  } catch (error) {

    console.error(
      "Obscura start error:",
      error
    );


    setRunning(false);


    setStatus(
      "Could not start capture.",
      "error"
    );

  }

}


/* =========================================================
   STOP CAPTURE
   ========================================================= */

async function stopCapture() {

  try {

    await chrome.runtime.sendMessage({
      type: "STOP_CAPTURE"
    });

  } catch (error) {

    console.error(
      "Obscura stop error:",
      error
    );

  }


  setRunning(false);


  setStatus(
    "Capture stopped.",
    "idle"
  );

}


/* =========================================================
   BACKGROUND MESSAGE HANDLER
   ========================================================= */

function handleBackgroundMessage(message) {

  switch (message.type) {

    case "REDACTED_PREVIEW":

      updatePreview(message);

      updateCounters(message);

      break;


    case "CAPTURE_STARTED":

      setRunning(true);

      setStatus(
        message.status ||
        "Capture cycle running…",
        "running"
      );

      break;


    case "CAPTURE_STOPPED":

      setRunning(false);

      setStatus(
        message.status ||
        "Capture stopped.",
        "idle"
      );

      break;


    case "STATUS_UPDATE":

      if (message.status) {

        setStatus(
          message.status,
          message.statusType ||
          "idle"
        );

      }


      if (
        message.captureRunning !==
        undefined
      ) {

        setRunning(
          Boolean(
            message.captureRunning
          )
        );

      }


      updateCounters(message);

      break;


    case "PRIVACY_UPDATE":

      updateCounters(message);

      break;


    case "P6_ACTION_RESULT":

      handleActionResult(message);

      break;


    default:
      break;

  }

}


/* =========================================================
   PREVIEW UPDATE
   ========================================================= */

function updatePreview(message) {

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

}


/* =========================================================
   SHOW PREVIEW IMAGE
   ========================================================= */

function showPreview(
  image,
  placeholder,
  data
) {

  const src =
    normalizeImageData(data);


  if (!src) {
    return;
  }


  image.src = src;

  image.classList.remove(
    "hidden"
  );

  placeholder.style.display =
    "none";

}


/* =========================================================
   IMAGE NORMALIZATION
   ========================================================= */

function normalizeImageData(data) {

  if (!data) {
    return null;
  }


  if (
    typeof data === "string" &&
    data.startsWith("data:")
  ) {

    return data;

  }


  if (typeof data === "string") {

    return (
      "data:image/png;base64," +
      data
    );

  }


  return null;

}


/* =========================================================
   COUNTERS
   ========================================================= */

function updateCounters(message) {

  if (!message) {
    return;
  }


  const counters =
    message.counters || {};


  const pii =
    message.pii_detected_count ??
    message.piiDetected ??
    counters.piiDetected;


  const redacted =
    message.redacted_count ??
    message.redacted ??
    counters.redacted;


  const sent =
    message.sent_to_ai_count ??
    message.sentToAI ??
    counters.sentToAI;


  if (typeof pii === "number") {

    piiCount.textContent =
      Math.max(0, pii);

  }


  if (typeof redacted === "number") {

    redactedCount.textContent =
      Math.max(0, redacted);

  }


  if (typeof sent === "number") {

    sentCount.textContent =
      Math.max(0, sent);

  }


  saveCounters();

}


/* =========================================================
   P6 ACTION RESULT
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

  }

}


/* =========================================================
   RUNNING STATE
   ========================================================= */

function setRunning(running) {

  running =
    Boolean(running);


  startBtn.disabled =
    running;


  stopBtn.disabled =
    !running;


  taskInput.disabled =
    running;


  headerStatusDot.classList.remove(
    "idle",
    "running",
    "error"
  );


  headerStatusDot.classList.add(
    running
      ? "running"
      : "idle"
  );

}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(
  text,
  type = "idle"
) {

  statusText.textContent =
    text;


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


  if (type === "error") {

    headerStatusDot.classList.add(
      "error"
    );

  } else if (type === "running") {

    headerStatusDot.classList.add(
      "running"
    );

  } else {

    headerStatusDot.classList.add(
      "idle"
    );

  }


  chrome.storage.local.set({

    obscura_status:
      text,

    obscura_status_type:
      type

  });

}


/* =========================================================
   RESTORE STATE
   ========================================================= */

async function restoreState() {

  try {

    const state =
      await chrome.storage.local.get([
        "obscura_task",
        "obscura_status",
        "obscura_status_type",
        "obscura_capture_running",
        "obscura_pii_detected",
        "obscura_redacted",
        "obscura_sent_to_ai"
      ]);


    if (state.obscura_task) {

      taskInput.value =
        state.obscura_task;

    }


    if (
      typeof state.obscura_pii_detected ===
      "number"
    ) {

      piiCount.textContent =
        state.obscura_pii_detected;

    }


    if (
      typeof state.obscura_redacted ===
      "number"
    ) {

      redactedCount.textContent =
        state.obscura_redacted;

    }


    if (
      typeof state.obscura_sent_to_ai ===
      "number"
    ) {

      sentCount.textContent =
        state.obscura_sent_to_ai;

    }


    if (state.obscura_status) {

      setStatus(
        state.obscura_status,
        state.obscura_status_type ||
        "idle"
      );

    }


    setRunning(
      Boolean(
        state.obscura_capture_running
      )
    );


  } catch (error) {

    console.error(
      "Could not restore popup state:",
      error
    );

  }

}


/* =========================================================
   SAVE COUNTERS
   ========================================================= */

function saveCounters() {

  chrome.storage.local.set({

    obscura_pii_detected:
      Number(
        piiCount.textContent
      ) || 0,

    obscura_redacted:
      Number(
        redactedCount.textContent
      ) || 0,

    obscura_sent_to_ai:
      Number(
        sentCount.textContent
      ) || 0

  });

}