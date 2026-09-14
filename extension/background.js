importScripts("./dist/p4-listener.js");
// background.js
// P1 — Capture Cycle Coordinator
//
// P1 pipeline:
//
//   P1 capture
//      ↓
//   P2 perception
//      ↓
//   P3 privacy processing
//      ↓
//   P4 relevance/change filtering
//      ↓
//   P5 reasoning
//      ↓
//   P6 action execution
//      ↓
//   fresh P1 capture
//
// P1 owns cycle_id.
// Downstream stages must never replace it.
//
// P1 also owns the task and explicitly forwards it to P4
// because P3's toP4 payload does not contain the task.
//
// TASK/TAB BEHAVIOUR:
//
// When a task starts, P1 binds that task to the tab where
// the task was started.
//
// Switching to another tab does NOT move the task to the
// new tab.
//
// IMPORTANT CHROME CAPTURE LIMITATION:
//
// chrome.tabs.captureVisibleTab() captures the currently
// visible tab. Therefore, P1 must not pretend that it can
// capture an inactive task tab using the current API.
//
// If the user switches away from the task tab, P1 waits
// before starting a NEW screenshot cycle. Once the user
// returns to the task tab, capture resumes.
//
// The current in-progress cycle is allowed to finish using
// the screenshot it already captured.
//
// P5 may return:
//   click
//   type
//   scroll
//   navigate
//   wait
//   done
//
// "done" is the explicit task-completion signal.



// ==================================================
// Configuration
// ==================================================

const CAPTURE_INTERVAL_MS = 5000;

const MAX_CAPTURE_ATTEMPTS = 2;

const MAX_SAVED_PAIRS = 15;

const P5_ENDPOINT =
  "http://localhost:8000/agent/reason";


// ==================================================
// Capture state
// ==================================================

let captureRunning = false;

let currentTask = null;

let currentCycleId = null;


// ==================================================
// Task tab state
//
// The task is bound to the tab where the user
// started the task.
//
// These values remain unchanged across cycles.
// ==================================================

let taskTabId = null;

let taskWindowId = null;


// ==================================================
// Confirmation state
// ==================================================

const pendingConfirmations = new Map();


// ==================================================
// Runtime messages
// ==================================================

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    // ----------------------------------------------
    // Popup → P1
    // ----------------------------------------------

    if (
      message?.type ===
      "START_CAPTURE"
    ) {

      startCaptureLoop(
        message.task
      );

      return false;
    }


    if (
      message?.type ===
      "STOP_CAPTURE"
    ) {

      stopCaptureLoop();

      return false;
    }


    // ----------------------------------------------
    // P6 → P1 confirmation request
    // ----------------------------------------------

    if (
      message?.type ===
      "P6_CONFIRMATION_REQUEST"
    ) {

      handleConfirmationRequest(
        message,
        sender
      );

      return false;
    }


    // ----------------------------------------------
    // Popup → P1 → P6 confirmation response
    // ----------------------------------------------

    if (
      message?.type ===
      "P6_CONFIRMATION_RESPONSE"
    ) {

      handleConfirmationResponse(
        message
      );

      return false;
    }


    // ----------------------------------------------
    // P6 → P1 direct action result
    // ----------------------------------------------

    if (
      message?.type ===
      "P6_ACTION_RESULT"
    ) {

      handleP6Result(
        message.result || message
      );

      return false;
    }


    return false;
  }
);


// ==================================================
// Start capture loop
// ==================================================

async function startCaptureLoop(task) {

  if (captureRunning) {

    notifyPopup(
      "Capture loop is already running."
    );

    return;
  }


  if (
    typeof task !== "string" ||
    !task.trim()
  ) {

    notifyPopup(
      "Enter a task first."
    );

    return;
  }


  // ----------------------------------------------
  // Get the active tab ONLY when a new task starts.
  // ----------------------------------------------

  const taskTab =
    await getActiveTab();


  if (
    !taskTab ||
    !taskTab.id
  ) {

    notifyPopup(
      "No active tab found."
    );

    return;
  }


  // ----------------------------------------------
  // Bind this task to the current tab.
  //
  // This binding remains unchanged for every
  // subsequent cycle.
  // ----------------------------------------------

  currentTask =
    task.trim();

  taskTabId =
    taskTab.id;

  taskWindowId =
    taskTab.windowId ??
    null;

  captureRunning = true;

  currentCycleId = null;


  resetPrivacyCounters();


  console.log(
    "[Obscura] Task started:",
    {
      task:
        currentTask,

      taskTabId,

      taskWindowId
    }
  );


  notifyPopup(
    `Capture loop started on tab ${taskTabId}.`
  );


  // ----------------------------------------------
  // Main cycle loop
  // ----------------------------------------------

  while (captureRunning) {

    // --------------------------------------------
    // Before beginning a NEW cycle, make sure the
    // original task tab is the visible tab.
    //
    // We do this because captureVisibleTab()
    // captures the visible tab.
    // --------------------------------------------

    const ready =
      await waitForTaskTabToBeActive();


    if (!ready) {
      break;
    }


    await runCaptureCycle(
      currentTask
    );


    if (!captureRunning) {
      break;
    }


    await sleep(
      CAPTURE_INTERVAL_MS
    );
  }


  // ----------------------------------------------
  // Clean up task state.
  // ----------------------------------------------

  captureRunning = false;

  currentTask = null;

  currentCycleId = null;

  taskTabId = null;

  taskWindowId = null;
}


// ==================================================
// Stop capture loop
// ==================================================

function stopCaptureLoop() {

  if (!captureRunning) {
    return;
  }


  captureRunning = false;


  taskTabId = null;

  taskWindowId = null;


  notifyPopup(
    "Capture loop stopped."
  );
}


// ==================================================
// Sleep
// ==================================================

function sleep(ms) {

  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}


// ==================================================
// Active tab
//
// Used ONLY when a NEW task is started.
//
// Do NOT use this to determine the tab for
// subsequent cycles.
// ==================================================

async function getActiveTab() {

  const [tab] =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });


  return tab;
}


// ==================================================
// Task tab
//
// Returns the tab associated with the current task.
// ==================================================

async function getTaskTab() {

  if (
    taskTabId === null ||
    taskTabId === undefined
  ) {

    return null;
  }


  try {

    return await chrome.tabs.get(
      taskTabId
    );

  } catch (error) {

    console.error(
      "[Obscura] Task tab is unavailable:",
      error
    );


    return null;
  }
}


// ==================================================
// Check whether the task tab is currently active
// ==================================================

async function isTaskTabActive() {

  const taskTab =
    await getTaskTab();


  if (
    !taskTab ||
    !taskTab.id
  ) {

    return false;
  }


  return (
    taskTab.active === true
  );
}


// ==================================================
// Wait for the task tab to become active
//
// This prevents a NEW cycle from accidentally
// capturing the user's unrelated tab.
//
// The task itself remains active.
//
// The user can freely work in other tabs.
// ==================================================

async function waitForTaskTabToBeActive() {

  while (captureRunning) {

    const taskTab =
      await getTaskTab();


    // --------------------------------------------
    // Original tab was closed.
    // --------------------------------------------

    if (
      !taskTab ||
      !taskTab.id
    ) {

      notifyPopup(
        "Task stopped because the original task tab was closed."
      );


      captureRunning =
        false;


      return false;
    }


    // --------------------------------------------
    // Task tab is active.
    // We can safely capture the visible tab.
    // --------------------------------------------

    if (
      taskTab.active === true
    ) {

      return true;
    }


    // --------------------------------------------
    // User is currently working elsewhere.
    //
    // Do NOT capture the new tab.
    // --------------------------------------------

    notifyPopup(
      "Task paused for capture — working in another tab."
    );


    await sleep(500);
  }


  return false;
}


// ==================================================
// Screenshot
//
// IMPORTANT:
//
// captureVisibleTab() captures the currently
// visible tab.
//
// Therefore this function is called only after
// waitForTaskTabToBeActive() confirms that the
// task tab is active.
// ==================================================

async function captureScreenshot() {

  return chrome.tabs.captureVisibleTab(
    null,
    {
      format: "png"
    }
  );
}


// ==================================================
// Viewport
// ==================================================

async function getViewportState(tabId) {

  return chrome.tabs.sendMessage(
    tabId,
    {
      type: "GET_VIEWPORT"
    }
  );
}


// ==================================================
// Viewport comparison
// ==================================================

function sameViewport(a, b) {

  return (
    a?.scrollX === b?.scrollX &&
    a?.scrollY === b?.scrollY &&
    a?.innerWidth === b?.innerWidth &&
    a?.innerHeight === b?.innerHeight
  );
}


// ==================================================
// Build P1 → P2 payload
// ==================================================

function buildPayload({
  task,
  screenshot,
  tab,
  viewport,
  cycleId,
  timestamp
}) {

  return {

    cycle_id:
      cycleId,

    screenshot,

    tab_url:
      tab.url,

    viewport: {

      width:
        viewport.innerWidth,

      height:
        viewport.innerHeight,

      scroll_x:
        viewport.scrollX,

      scroll_y:
        viewport.scrollY
    },

    task,

    timestamp
  };
}


// ==================================================
// P1 → P2/P3
// ==================================================

async function sendToDownstream(
  tabId,
  payload
) {

  if (!tabId) {

    return {
      valid: false,
      error:
        "No tab ID available."
    };
  }


  try {

    const response =
      await chrome.tabs.sendMessage(
        tabId,
        {
          type:
            "P1_CAPTURE_CYCLE",

          payload
        }
      );


    console.log(
      "[Obscura] P2/P3 response:",
      response
    );


    return response || {
      valid: false,
      error:
        "Empty downstream response."
    };

  } catch (error) {

    console.error(
      "[Obscura] P2/P3 communication failed:",
      error
    );


    return {
      valid: false,
      error:
        error?.message ||
        "P2/P3 communication failed."
    };
  }
}


// ==================================================
// P3 → P4
//
// IMPORTANT:
// P3's toP4 contains:
//   frame_id
//   elements
//   screenshot
//
// Task is owned by P1 and therefore explicitly
// forwarded separately.
//
// P4 expects:
//
// {
//   type: "P4_INPUT",
//   payload,
//   task
// }
// ==================================================

async function sendToP4(payload, task) {

  if (!payload || !Array.isArray(payload.elements)) {
    return {
      valid: false,
      error: "Invalid P4 payload."
    };
  }

  if (typeof task !== "string" || !task.trim()) {
    return {
      valid: false,
      error: "Missing task for P4."
    };
  }

  console.log("[P1 → P4] Request:", {
    type: "P4_INPUT",
    payload,
    task: task.trim()
  });

  try {

    if (typeof globalThis.handleP4Input !== "function") {
      return {
        valid: false,
        error: "P4 handler is not loaded."
      };
    }

    const response = globalThis.handleP4Input(
      payload,
      task.trim()
    );

    console.log("[P4 → P1] Response:", response);

    return response;

  } catch (error) {

    console.error(
      "[P1] P4 processing failed:",
      error
    );

    return {
      valid: false,
      error: error?.message || "P4 processing failed."
    };
  }
}


// ==================================================
// P4 → P5
// ==================================================

async function callP5({
  task,
  toP4
}) {

  if (!toP4) {

    throw new Error(
      "Missing P4 payload."
    );
  }


  const requestBody = {

    frame_id:
      toP4.frame_id ??
      null,

    task,

    elements:
      Array.isArray(
        toP4.elements
      )
        ? toP4.elements
        : [],

    screenshot:
      toP4.screenshot ??
      null
  };


  console.log(
    "[P1 → P5] Request:",
    requestBody
  );


  let response;


  try {

    response =
      await fetch(
        P5_ENDPOINT,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              requestBody
            )
        }
      );

  } catch (error) {

    throw new Error(
      `P5 connection failed: ${
        error?.message ||
        "network error"
      }`
    );
  }


  const status =
    response.status;


  let data = null;


  try {

    data =
      await response.json();

  } catch {

    data = null;
  }


  console.log(
    "[P5] HTTP status:",
    status
  );

  console.log(
    "[P5] Response:",
    data
  );


  if (status === 422) {

    throw new Error(
      "P5 rejected the request (422 malformed payload)."
    );
  }


  if (status === 502) {

    throw new Error(
      "P5 model response failed validation (502)."
    );
  }


  if (status === 504) {

    throw new Error(
      "P5 model call timed out (504)."
    );
  }


  if (!response.ok) {

    throw new Error(
      `P5 request failed with HTTP ${status}.`
    );
  }


  validateP5Response(
    data
  );


  return data;
}


// ==================================================
// Validate P5 response
// ==================================================

function validateP5Response(data) {

  const allowedActions =
    new Set([
      "click",
      "type",
      "scroll",
      "navigate",
      "wait",
      "done"
    ]);


  if (
    !data ||
    typeof data !== "object"
  ) {

    throw new Error(
      "P5 returned an invalid response."
    );
  }


  if (
    !allowedActions.has(
      data.action
    )
  ) {

    throw new Error(
      `P5 returned unsupported action: ${data.action}`
    );
  }


  if (
    typeof data.confidence !==
      "number" ||
    data.confidence < 0 ||
    data.confidence > 1
  ) {

    throw new Error(
      "P5 returned invalid confidence."
    );
  }


  if (
    data.target_id !== null &&
    data.target_id !== undefined &&
    typeof data.target_id !== "string"
  ) {

    throw new Error(
      "P5 returned invalid target_id."
    );
  }


  if (
    data.metadata !== undefined &&
    (
      data.metadata === null ||
      typeof data.metadata !== "object"
    )
  ) {

    throw new Error(
      "P5 returned invalid metadata."
    );
  }
}


// ==================================================
// Handle P5 action
// ==================================================

async function handleP5Action(
  p5Action,
  cycleId,
  tabId
) {

  // ----------------------------------------------
  // DONE
  // ----------------------------------------------

  if (
    p5Action.action ===
    "done"
  ) {

    const message =
      p5Action.metadata?.message ||
      "Task completed successfully.";


    notifyPopup(
      message
    );


    return "DONE";
  }


  // ----------------------------------------------
  // WAIT
  // ----------------------------------------------

  if (
    p5Action.action ===
    "wait"
  ) {

    const reason =
      p5Action.metadata?.reason;


    if (
      reason ===
      "sensitive_field_requires_user"
    ) {

      notifyPopup(
        "User input required: a sensitive field needs to be filled manually."
      );


      return "WAIT";
    }


    notifyPopup(
      `P5 returned wait (confidence ${p5Action.confidence}).`
    );


    return "WAIT";
  }


  // ----------------------------------------------
  // Normal action → P6
  // ----------------------------------------------

  notifyPopup(
    `P5 action: ${p5Action.action}`
  );


  const result =
    await sendActionToP6(
      p5Action,
      cycleId,
      tabId
    );


  if (!result) {

    notifyPopup(
      "P6 returned no action result."
    );


    return "CONTINUE";
  }


  handleP6Result(
    result
  );


  return "CONTINUE";
}


// ==================================================
// P1 → P6 action request
//
// IMPORTANT:
// This retains the existing P1 message string:
//
//   P6_ACTION_REQUEST
//
// Your supplied P6 messageTypes.js only confirms
// P6_CONFIRMATION_REQUEST and
// P6_CONFIRMATION_RESPONSE.
//
// Therefore this action-request string should be
// matched against the actual P6 action listener.
// ==================================================

async function sendActionToP6(
  action,
  cycleId,
  tabId
) {

  const p6Request = {

    type:
      "P6_ACTION_REQUEST",

    cycle_id:
      cycleId,

    action:
      action.action,

    target_id:
      action.target_id ??
      null,

    confidence:
      action.confidence,

    metadata:
      action.metadata ||
      {}
  };


  console.log(
    "[P1 → P6] Action request:",
    p6Request
  );


  try {

    const result =
      await chrome.runtime.sendMessage(
        p6Request
      );


    console.log(
      "[P6 → P1] Action result:",
      result
    );


    return result ||
      null;

  } catch (error) {

    console.error(
      "[Obscura] P6 request failed:",
      error
    );


    notifyPopup(
      `P6 communication failed: ${
        error?.message ||
        "unknown error"
      }`
    );


    return {

      status:
        "FAILED",

      action:
        action.action,

      target_id:
        action.target_id ??
        null,

      reason:
        "P6 communication failed",

      detail:
        error?.message
    };
  }
}


// ==================================================
// P6 result
// ==================================================

function handleP6Result(
  result
) {

  if (!result) {
    return;
  }


  console.log(
    "[P1] P6 completion:",
    result
  );


  switch (
    result.status
  ) {

    case "EXECUTED":

      notifyPopup(
        `P6 executed ${
          result.action ||
          "action"
        } successfully.`
      );

      return;


    case "BLOCKED":

      notifyPopup(
        `P6 blocked ${
          result.action ||
          "action"
        }: ${
          result.reason ||
          "safety policy"
        }`
      );

      return;


    case "CONFIRMATION_PENDING":

      notifyPopup(
        "P6 is waiting for user confirmation."
      );

      return;


    case "FAILED":

      notifyPopup(
        `P6 action failed: ${
          result.reason ||
          result.detail ||
          "unknown reason"
        }`
      );

      return;


    default:

      notifyPopup(
        "P6 returned an unknown status."
      );
  }
}


// ==================================================
// P6 → P1 confirmation request
// ==================================================

function handleConfirmationRequest(
  message,
  sender
) {

  const requestId =
    message.requestId;


  if (!requestId) {

    console.error(
      "[P1] P6 confirmation missing requestId."
    );

    return;
  }


  pendingConfirmations.set(
    requestId,
    {
      senderId:
        sender?.id ??
        null,

      tabId:
        sender?.tab?.id ??
        null
    }
  );


  const targetSummary =
    message.targetSummary ||
    "P6 wants to perform an action.";


  console.log(
    "[P1] P6 confirmation request:",
    message
  );


  notifyPopup(
    `Confirmation required: ${targetSummary}`
  );


  chrome.runtime
    .sendMessage({

      type:
        "P6_CONFIRMATION_REQUEST",

      requestId,

      action:
        message.action,

      targetSummary
    })
    .catch(() => {});
}


// ==================================================
// Popup → P1 → P6 confirmation response
// ==================================================

async function handleConfirmationResponse(
  message
) {

  const {
    requestId,
    approved
  } = message;


  if (!requestId) {

    console.error(
      "[P1] Missing confirmation requestId."
    );

    return;
  }


  if (
    typeof approved !==
    "boolean"
  ) {

    console.error(
      "[P1] Invalid confirmation approval value."
    );

    return;
  }


  const pending =
    pendingConfirmations.get(
      requestId
    );


  if (!pending) {

    console.warn(
      "[P1] Confirmation request is no longer pending:",
      requestId
    );

    return;
  }


  pendingConfirmations.delete(
    requestId
  );


  try {

    await chrome.runtime.sendMessage({

      type:
        "P6_CONFIRMATION_RESPONSE",

      requestId,

      approved
    });


    notifyPopup(
      approved
        ? "Confirmation approved."
        : "Confirmation denied."
    );

  } catch (error) {

    console.error(
      "[P1] Failed to send confirmation to P6:",
      error
    );


    notifyPopup(
      "Failed to send confirmation response to P6."
    );
  }
}


// ==================================================
// Popup status
// ==================================================

function notifyPopup(
  status
) {

  chrome.storage.local
    .set({
      obscuraStatus:
        status
    })
    .catch(() => {});


  chrome.runtime
    .sendMessage({

      type:
        "STATUS_UPDATE",

      status
    })
    .catch(() => {});
}


// ==================================================
// Privacy counters
// ==================================================

function resetPrivacyCounters() {

  chrome.storage.local
    .set({

      obscuraCounters: {

        pii_detected_count:
          0,

        redacted_count:
          0,

        sent_to_ai_count:
          0
      }
    })
    .catch(() => {});
}


function sendPrivacyCounters(
  cycleId,
  toP1
) {

  if (!toP1) {
    return;
  }


  const counters = {

    pii_detected_count:
      toP1.pii_detected_count ??
      0,

    redacted_count:
      toP1.redacted_count ??
      0,

    sent_to_ai_count:
      toP1.sent_to_ai_count ??
      0
  };


  chrome.storage.local
    .set({
      obscuraCounters:
        counters
    })
    .catch(() => {});


  chrome.runtime
    .sendMessage({

      type:
        "PRIVACY_COUNTERS",

      cycle_id:
        cycleId,

      privacy_status:
        toP1.privacy_status,

      pii_detected_count:
        counters.pii_detected_count,

      redacted_count:
        counters.redacted_count,

      sensitive_types:
        toP1.sensitive_types,

      sent_to_ai_count:
        counters.sent_to_ai_count
    })
    .catch(() => {});
}


// ==================================================
// Screenshot preview + save
// ==================================================

async function handleRedactedScreenshot(
  cycleId,
  originalScreenshot,
  redactedScreenshot
) {

  if (!redactedScreenshot) {
    return;
  }


  // ----------------------------------------------
  // The original screenshot may be sent to the
  // local popup for the current preview.
  //
  // It is NOT persisted to Downloads.
  // It is NOT placed in chrome.storage.
  // ----------------------------------------------

  chrome.runtime
    .sendMessage({

      type:
        "REDACTED_PREVIEW",

      cycle_id:
        cycleId,

      original_screenshot:
        originalScreenshot,

      redacted_screenshot:
        redactedScreenshot
    })
    .catch(() => {});


  // ----------------------------------------------
  // Persist ONLY the redacted screenshot.
  // ----------------------------------------------

  await saveRedactedScreenshot({

    cycle_id:
      cycleId,

    redacted_screenshot:
      redactedScreenshot
  });
}


// ==================================================
// Normalize image data
// ==================================================

function normalizeImageData(
  value,
  defaultMime =
    "image/png"
) {

  if (
    !value ||
    typeof value !== "string"
  ) {

    return null;
  }


  if (
    value.startsWith(
      "data:image/"
    )
  ) {

    return value;
  }


  return `data:${defaultMime};base64,${value}`;
}


// ==================================================
// Save REDACTED screenshot only
//
// PRIVACY:
//
// Original screenshot:
//   - stays in memory during the current cycle
//   - is NOT saved to disk
//   - is NOT persisted in chrome.storage
//
// Redacted screenshot:
//   - is sanitized by P3
//   - may be saved locally for transparency/demo
//
// Files:
//
// Downloads/
//   obscura-redacted/
//     <cycle>-REDACTED.png
// ==================================================

async function saveRedactedScreenshot({
  cycle_id,
  redacted_screenshot
}) {

  try {

    const redactedDataUrl =
      normalizeImageData(
        redacted_screenshot,
        "image/png"
      );


    if (!redactedDataUrl) {

      console.warn(
        "[Obscura] No redacted screenshot available to save."
      );

      return;
    }


    const entry = {

      cycleId:
        cycle_id,

      // ------------------------------------------
      // Original screenshot is deliberately NOT
      // persisted.
      // ------------------------------------------

      originalId:
        null,

      redactedId:
        null,

      createdAt:
        Date.now()
    };


    // --------------------------------------------
    // Save ONLY the redacted screenshot.
    // --------------------------------------------

    entry.redactedId =
      await chrome.downloads.download({

        url:
          redactedDataUrl,

        filename:
          `obscura-redacted/${cycle_id}-REDACTED.png`,

        saveAs:
          false,

        conflictAction:
          "overwrite"
      });


    // --------------------------------------------
    // Store ONLY metadata about the redacted
    // screenshot.
    // --------------------------------------------

    const stored =
      await chrome.storage.local.get({
        obscuraSavedPairs:
          []
      });


    const pairs =
      Array.isArray(
        stored.obscuraSavedPairs
      )
        ? stored.obscuraSavedPairs
        : [];


    pairs.push(
      entry
    );


    // --------------------------------------------
    // Keep latest 15 redacted screenshots.
    // --------------------------------------------

    while (
      pairs.length >
      MAX_SAVED_PAIRS
    ) {

      const oldest =
        pairs.shift();


      const id =
        oldest?.redactedId;


      if (id == null) {
        continue;
      }


      try {

        await chrome.downloads.removeFile(
          id
        );

      } catch {}


      try {

        await chrome.downloads.erase({
          id
        });

      } catch {}
    }


    await chrome.storage.local.set({

      obscuraSavedPairs:
        pairs

    });


  } catch (error) {

    console.error(
      "[Obscura] Failed to save redacted screenshot:",
      error
    );
  }
}


// ==================================================
// ONE complete capture cycle
// ==================================================

async function runCaptureCycle(
  task,
  maxAttempts =
    MAX_CAPTURE_ATTEMPTS
) {

  // ----------------------------------------------
  // IMPORTANT:
  // Always retrieve the task-bound tab.
  //
  // Never use getActiveTab() here.
  // ----------------------------------------------

  const tab =
    await getTaskTab();


  if (
    !tab ||
    !tab.id
  ) {

    notifyPopup(
      "Task tab was closed or is no longer available."
    );


    captureRunning =
      false;


    return;
  }


  // ----------------------------------------------
  // Safety check:
  //
  // captureVisibleTab() must capture the same
  // tab whose DOM is sent to P2/P3.
  //
  // The main loop already waits for the task tab
  // to be active, but this check protects against
  // a tab switch occurring immediately before the
  // cycle starts.
  // ----------------------------------------------

  if (
    !(await isTaskTabActive())
  ) {

    notifyPopup(
      "Task tab is not active. Waiting before capture."
    );

    return;
  }


  // ----------------------------------------------
  // P1 creates ONE authoritative ID.
  //
  // Retries reuse this ID.
  // ----------------------------------------------

  const cycleId =
    crypto.randomUUID();


  currentCycleId =
    cycleId;


  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {

    notifyPopup(
      `Capturing (attempt ${attempt}/${maxAttempts})...`
    );


    try {

      // ------------------------------------------
      // 1. Viewport before capture
      // ------------------------------------------

      const viewportBefore =
        await getViewportState(
          tab.id
        );


      // ------------------------------------------
      // 2. Capture screenshot
      //
      // The task tab is active here.
      // ------------------------------------------

      const screenshot =
        await captureScreenshot();


      // ------------------------------------------
      // 3. Timestamp
      // ------------------------------------------

      const timestamp =
        Date.now();


      // ------------------------------------------
      // 4. Viewport after capture
      // ------------------------------------------

      const viewportAfter =
        await getViewportState(
          tab.id
        );


      // ------------------------------------------
      // 5. Validate viewport
      // ------------------------------------------

      if (
        !sameViewport(
          viewportBefore,
          viewportAfter
        )
      ) {

        if (
          attempt <
          maxAttempts
        ) {

          notifyPopup(
            "Viewport changed during capture, retrying..."
          );

          continue;
        }


        notifyPopup(
          "Viewport kept changing - cycle cancelled."
        );

        return;
      }


      // ------------------------------------------
      // 6. Build P1 → P2 payload
      // ------------------------------------------

      const payload =
        buildPayload({

          task,

          screenshot,

          tab,

          viewport:
            viewportAfter,

          cycleId,

          timestamp
        });


      // ------------------------------------------
      // 7. P1 → P2 → P3
      // ------------------------------------------

      const p23Result =
        await sendToDownstream(
          tab.id,
          payload
        );


      if (
        !p23Result?.valid
      ) {

        if (
          attempt <
          maxAttempts
        ) {

          notifyPopup(
            "P2/P3 returned an invalid frame, retrying..."
          );

          continue;
        }


        notifyPopup(
          "Frame invalid after retry - cycle cancelled."
        );

        return;
      }


      // ------------------------------------------
      // 8. Verify cycle ID
      // ------------------------------------------

      if (
        p23Result.cycle_id &&
        p23Result.cycle_id !==
          cycleId
      ) {

        console.error(
          "[P1] Cycle ID mismatch:",
          {
            expected:
              cycleId,

            received:
              p23Result.cycle_id
          }
        );


        notifyPopup(
          "Cycle ID mismatch - cycle cancelled."
        );

        return;
      }


      // ------------------------------------------
      // 9. P3 → P1 privacy counters
      // ------------------------------------------

      sendPrivacyCounters(
        cycleId,
        p23Result.toP1
      );


      // ------------------------------------------
      // 10. Require P3 → P4 payload
      // ------------------------------------------

      if (
        !p23Result.toP4
      ) {

        notifyPopup(
          "P3 did not return a P4 payload."
        );

        return;
      }


      // ------------------------------------------
      // 11. P3 → P6 sensitive map
      // ------------------------------------------

      if (
        p23Result.toP6
      ) {

        chrome.runtime
          .sendMessage({

            type:
              "P6_SENSITIVE_MAP",

            payload:
              p23Result.toP6
          })
          .catch(() => {});
      }


      // ------------------------------------------
      // 12. Preview + save REDACTED screenshot
      //
      // Original screenshot is used only for the
      // current local preview and is NOT persisted.
      // ------------------------------------------

      if (
        p23Result.toP4.screenshot
      ) {

        await handleRedactedScreenshot(

          cycleId,

          screenshot,

          p23Result.toP4.screenshot
        );
      }


      // ------------------------------------------
      // 13. P3 → P4
      //
      // Task is explicitly forwarded.
      // ------------------------------------------

      notifyPopup(
        "Filtering frame in P4..."
      );


      const p4Response =
        await sendToP4(
          p23Result.toP4,
          task
        );


      if (
        !p4Response?.valid ||
        !p4Response.result
      ) {

        notifyPopup(
          `P4 failed: ${
            p4Response?.error ||
            "invalid P4 response."
          }`
        );

        return;
      }


      // ------------------------------------------
      // 14. Verify P4 frame ID
      // ------------------------------------------

      if (
        p4Response.result.frame_id &&
        p23Result.toP4.frame_id &&
        p4Response.result.frame_id !==
          p23Result.toP4.frame_id
      ) {

        notifyPopup(
          "P4 frame ID mismatch - cycle cancelled."
        );

        return;
      }


      // ------------------------------------------
      // 15. P4 → P5
      //
      // P5 receives ONLY P4's filtered elements.
      // ------------------------------------------

      notifyPopup(
        "Sending filtered frame to P5..."
      );


      let p5Action;


      try {

        p5Action =
          await callP5({

            task,

            toP4:
              p4Response.result
          });

      } catch (error) {

        console.error(
          "[P1] P5 failed:",
          error
        );


        notifyPopup(
          error?.message ||
          "P5 failed."
        );


        return;
      }


      // ------------------------------------------
      // 16. P5 → P1 → P6 / wait / done
      // ------------------------------------------

      const outcome =
        await handleP5Action(

          p5Action,

          cycleId,

          tab.id
        );


      notifyPopup(
        `Cycle ${cycleId} completed.`
      );


      console.log(
        `[Obscura] Cycle ${cycleId} completed successfully.`
      );


      // ------------------------------------------
      // DONE = stop entire capture loop.
      // ------------------------------------------

      if (
        outcome ===
        "DONE"
      ) {

        captureRunning =
          false;

        return;
      }


      // ------------------------------------------
      // For all other valid actions:
      //
      // run one cycle and let the outer loop
      // wait 5 seconds before the next capture.
      //
      // Before that next capture, the task tab
      // must be active so captureVisibleTab()
      // cannot accidentally capture another tab.
      // ------------------------------------------

      return;

    } catch (error) {

      console.error(
        `[Obscura] Capture attempt ${attempt} failed:`,
        error
      );


      if (
        attempt <
        maxAttempts
      ) {

        notifyPopup(
          "Capture failed, retrying..."
        );

        continue;
      }


      notifyPopup(
        "Capture failed after retry - cycle cancelled."
      );

      return;
    }
  }
}