/* =========================================================
   OBSCURA POPUP
   ========================================================= */


/* =========================================================
   ELEMENTS
   ========================================================= */

const taskInput =
  document.getElementById("task-input");

const startBtn =
  document.getElementById("start-btn");

const stopBtn =
  document.getElementById("stop-btn");

const statusBar =
  document.getElementById("status-bar");

const statusDot =
  document.getElementById("status-dot");

const statusText =
  document.getElementById("status-text");

const headerDot =
  document.getElementById("header-dot");

const piiCount =
  document.getElementById("pii-count");

const redactedCount =
  document.getElementById("redacted-count");

const sentCount =
  document.getElementById("sent-count");

const logo =
  document.getElementById("obscura-logo");

const originalPreview =
  document.getElementById("original-preview");

const redactedPreview =
  document.getElementById("redacted-preview");

const originalPlaceholder =
  document.getElementById("original-placeholder");

const redactedPlaceholder =
  document.getElementById("redacted-placeholder");


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    loadLogo();

    setupListeners();

    await restoreState();

  }
);


/* =========================================================
   LOGO
   ========================================================= */

function loadLogo() {

  /*
   * IMPORTANT:
   * The logo is inside:
   *
   * assets/obscura-logo.jpeg
   *
   * chrome.runtime.getURL() gives Chrome the
   * actual packaged extension URL.
   */

  const logoUrl =
    chrome.runtime.getURL(
      "assets/obscura-logo.jpeg"
    );

  logo.src = logoUrl;


  logo.onload = () => {

    console.log(
      "Obscura logo loaded:",
      logoUrl
    );

  };


  logo.onerror = () => {

    console.error(
      "Obscura logo could not be loaded:",
      logoUrl
    );

  };

}


/* =========================================================
   LISTENERS
   ========================================================= */

function setupListeners() {

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

      if (!message) {
        return;
      }

      handleMessage(message);

    }
  );

}


/* =========================================================
   START
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
        task: task
      });


    if (
      response &&
      response.valid === false
    ) {

      setRunning(false);

      setStatus(
        response.error ||
        "Unable to start capture.",
        "error"
      );

      return;

    }


    await chrome.storage.local.set({

      obscura_task: task,

      obscura_capture_running: true

    });

  } catch (error) {

    console.error(
      "START_CAPTURE error:",
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
   STOP
   ========================================================= */

async function stopCapture() {

  try {

    await chrome.runtime.sendMessage({
      type: "STOP_CAPTURE"
    });

  } catch (error) {

    console.error(
      "STOP_CAPTURE error:",
      error
    );

  }


  await chrome.storage.local.set({

    obscura_capture_running:
      false

  });


  setRunning(false);


  setStatus(
    "Capture stopped.",
    "idle"
  );

}


/* =========================================================
   BACKGROUND MESSAGES
   ========================================================= */

function handleMessage(message) {

  switch (message.type) {

    case "REDACTED_PREVIEW":

      updatePreview(message);

      updateCounters(message);

      if (
        message.status ||
        message.message
      ) {

        setStatus(
          message.status ||
          message.message,
          message.statusType ||
          "running"
        );

      }

      break;


    case "CAPTURE_STARTED":

      setRunning(true);

      setStatus(
        message.status ||
        message.message ||
        "Capture cycle running…",
        "running"
      );

      break;


    case "CAPTURE_STOPPED":

      setRunning(false);

      setStatus(
        message.status ||
        message.message ||
        "Capture stopped.",
        "idle"
      );

      break;


    case "STATUS_UPDATE":

      handleStatus(message);

      break;


    case "STATUS":

      handleStatus(message);

      break;


    case "POPUP_STATUS":

      handleStatus(message);

      break;


    case "PRIVACY_UPDATE":

      updateCounters(message);

      handleStatus(message);

      break;


    case "P6_ACTION_RESULT":

      handleActionResult(message);

      break;


    default:

      /*
       * Allows status/counter messages that
       * don't have a dedicated type.
       */

      if (
        message.status ||
        message.message ||
        message.pii_detected_count !==
          undefined ||
        message.redacted_count !==
          undefined ||
        message.sent_to_ai_count !==
          undefined
      ) {

        handleStatus(message);

      }

      break;

  }

}


/* =========================================================
   STATUS MESSAGE
   ========================================================= */

function handleStatus(message) {

  const text =
    message.status ||
    message.message ||
    message.text;


  if (text) {

    setStatus(
      text,
      normalizeStatus(
        message.statusType ||
        message.status_type ||
        "idle"
      )
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


  if (
    message.capture_running !==
    undefined
  ) {

    setRunning(
      Boolean(
        message.capture_running
      )
    );

  }


  updateCounters(message);

}


/* =========================================================
   PREVIEW
   ========================================================= */

function updatePreview(message) {

  const original =
    message.originalScreenshot ||
    message.original_screenshot ||
    message.original;


  const redacted =
    message.redactedScreenshot ||
    message.redacted_screenshot ||
    message.redacted;


  if (original) {

    showImage(
      originalPreview,
      originalPlaceholder,
      original
    );

  }


  if (redacted) {

    showImage(
      redactedPreview,
      redactedPlaceholder,
      redacted
    );

  }

}


/* =========================================================
   SHOW IMAGE
   ========================================================= */

function showImage(
  image,
  placeholder,
  data
) {

  const source =
    normalizeImage(data);


  if (!source) {
    return;
  }


  image.src = source;

  image.classList.add(
    "visible"
  );

  placeholder.style.display =
    "none";

}


/* =========================================================
   IMAGE DATA
   ========================================================= */

function normalizeImage(data) {

  if (!data) {
    return null;
  }


  if (
    typeof data === "string" &&
    data.startsWith("data:")
  ) {

    return data;

  }


  if (
    typeof data === "string"
  ) {

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
    message.counters ||
    message.privacy ||
    {};


  const pii =
    message.pii_detected_count ??
    message.pii_detected ??
    message.piiDetected ??
    counters.piiDetected ??
    counters.pii_detected;


  const redacted =
    message.redacted_count ??
    message.redactedCount ??
    message.redacted ??
    counters.redacted;


  const sent =
    message.sent_to_ai_count ??
    message.sent_to_ai ??
    message.sentToAI ??
    counters.sentToAI ??
    counters.sent_to_ai;


  if (
    typeof pii === "number"
  ) {

    piiCount.textContent =
      String(
        Math.max(0, pii)
      );

  }


  if (
    typeof redacted === "number"
  ) {

    redactedCount.textContent =
      String(
        Math.max(0, redacted)
      );

  }


  if (
    typeof sent === "number"
  ) {

    sentCount.textContent =
      String(
        Math.max(0, sent)
      );

  }


  saveCounters();

}


/* =========================================================
   P6 RESULT
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


  headerDot.classList.remove(
    "running",
    "error"
  );


  if (running) {

    headerDot.classList.add(
      "running"
    );

  }

}


/* =========================================================
   STATUS UI
   ========================================================= */

function setStatus(
  text,
  type = "idle"
) {

  if (!text) {
    return;
  }


  type =
    normalizeStatus(type);


  statusText.textContent =
    String(text);


  statusBar.classList.remove(
    "running",
    "success",
    "error",
    "paused"
  );


  if (type !== "idle") {

    statusBar.classList.add(
      type
    );

  }


  headerDot.classList.remove(
    "running",
    "error"
  );


  if (type === "running") {

    headerDot.classList.add(
      "running"
    );

  } else if (
    type === "error"
  ) {

    headerDot.classList.add(
      "error"
    );

  }


  chrome.storage.local.set({

    obscura_status:
      String(text),

    obscura_status_type:
      type

  });

}


/* =========================================================
   STATUS NORMALIZATION
   ========================================================= */

function normalizeStatus(type) {

  if (
    type === "running" ||
    type === "success" ||
    type === "error" ||
    type === "paused"
  ) {

    return type;

  }

  return "idle";

}


/* =========================================================
   RESTORE
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
        String(
          state.obscura_pii_detected
        );

    }


    if (
      typeof state.obscura_redacted ===
      "number"
    ) {

      redactedCount.textContent =
        String(
          state.obscura_redacted
        );

    }


    if (
      typeof state.obscura_sent_to_ai ===
      "number"
    ) {

      sentCount.textContent =
        String(
          state.obscura_sent_to_ai
        );

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
      "Restore state error:",
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