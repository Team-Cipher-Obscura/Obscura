/* =========================================================
   OBSCURA POPUP
   P1 UI CONTROLLER
   ========================================================= */


/* =========================================================
   DOM
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

const logo =
  document.getElementById(
    "obscura-logo"
  );


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    setupListeners();

    setupLogo();

    await restoreState();

  }
);


/* =========================================================
   LOGO
   ========================================================= */

function setupLogo() {

  /*
   * Primary path.
   */
  const extensionLogo =
    chrome.runtime.getURL(
      "assets/obscura-logo.jpeg"
    );

  /*
   * Use the extension-resolved URL.
   */
  logo.src = extensionLogo;


  /*
   * If the browser cannot load it, try the
   * relative packaged path once more.
   */
  logo.onerror = () => {

    if (
      logo.dataset.fallbackUsed ===
      "true"
    ) {
      return;
    }

    logo.dataset.fallbackUsed =
      "true";

    logo.src =
      "./assets/obscura-logo.jpeg";

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

      handleBackgroundMessage(
        message
      );

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
        task
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

      obscura_task:
        task,

      obscura_capture_running:
        true

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
   STOP
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
   BACKGROUND MESSAGE HANDLER
   ========================================================= */

function handleBackgroundMessage(
  message
) {

  const type =
    message.type ||
    message.event ||
    "";


  switch (type) {

    case "REDACTED_PREVIEW":

      updatePreview(message);

      updateCounters(message);

      /*
       * If the background doesn't provide a
       * separate status, give the user a useful
       * capture status.
       */
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

      handleStatusMessage(
        message
      );

      break;


    case "STATUS":

      handleStatusMessage(
        message
      );

      break;


    case "POPUP_STATUS":

      handleStatusMessage(
        message
      );

      break;


    case "PRIVACY_UPDATE":

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


    case "P6_ACTION_RESULT":

      handleActionResult(
        message
      );

      break;


    default:

      /*
       * Some background messages may carry
       * status/counters without a dedicated
       * message type.
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

        handleStatusMessage(
          message
        );

      }

      break;

  }

}


/* =========================================================
   STATUS MESSAGE
   ========================================================= */

function handleStatusMessage(
  message
) {

  const text =
    message.status ||
    message.message ||
    message.text ||
    null;


  const type =
    message.statusType ||
    message.status_type ||
    "idle";


  if (text) {

    setStatus(
      text,
      normalizeStatusType(type)
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
   STATUS TYPE
   ========================================================= */

function normalizeStatusType(
  type
) {

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
   PREVIEW
   ========================================================= */

function updatePreview(message) {

  const original =
    message.originalScreenshot ||
    message.original_screenshot ||
    message.original ||
    null;


  const redacted =
    message.redactedScreenshot ||
    message.redacted_screenshot ||
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
   SHOW IMAGE
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
   NORMALIZE IMAGE
   ========================================================= */

function normalizeImageData(
  data
) {

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

function updateCounters(
  message
) {

  if (!message) {
    return;
  }


  const counters =
    message.counters ||
    message.privacy ||
    {};


  const pii =
    message.pii_detected_count ??
    message.piiDetected ??
    message.pii_detected ??
    counters.piiDetected ??
    counters.pii_detected;


  const redacted =
    message.redacted_count ??
    message.redactedCount ??
    message.redacted ??
    counters.redacted;


  const sent =
    message.sent_to_ai_count ??
    message.sentToAI ??
    message.sent_to_ai ??
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

function handleActionResult(
  message
) {

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

function setRunning(
  running
) {

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
   STATUS UI
   ========================================================= */

function setStatus(
  text,
  type = "idle"
) {

  if (!text) {
    return;
  }


  statusText.textContent =
    String(text);


  statusBar.classList.remove(
    "idle",
    "running",
    "success",
    "error",
    "paused"
  );


  statusBar.classList.add(
    normalizeStatusType(type)
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

  } else if (
    type === "running"
  ) {

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
      String(text),

    obscura_status_type:
      normalizeStatusType(type)

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


    /*
     * Restore the last status.
     */
    if (state.obscura_status) {

      setStatus(
        state.obscura_status,
        state.obscura_status_type ||
        "idle"
      );

    }


    /*
     * Restore running state.
     */
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