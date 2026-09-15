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
// P1 owns the task and explicitly forwards it to P4
// because P3's toP4 payload does not contain the task.
//
// ==================================================
// TASK / TAB BEHAVIOUR
// ==================================================
//
// Each started task gets its own task session.
//
// Example:
//
//   Task A → Tab A
//       ↓
//   user switches to Tab B
//       ↓
//   Task A continues on Tab A
//
//   Start Task B on Tab B
//       ↓
//   Task A continues on Tab A
//   Task B starts on Tab B
//
// A cycle always retains the tab that belongs to its
// task session.
//
// The current active tab is ONLY used when START_CAPTURE
// creates a NEW task session.
//
// ==================================================
//
// SCREENSHOT BEHAVIOUR
// ==================================================
//
// chrome.tabs.captureVisibleTab() only captures the
// currently visible tab.
//
// To preserve task ownership when the task tab becomes
// inactive, P1 uses chrome.debugger + CDP
// Page.captureScreenshot against the task tab.
//
// ==================================================
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


// ==================================================
// Load P4
// ==================================================

importScripts("./dist/p4-listener.js");


// ==================================================
// Verify P4 loaded
// ==================================================

if (
  typeof globalThis.handleP4Input !==
  "function"
) {

  console.error(
    "[Obscura][P4] P4 listener failed to load."
  );

} else {

  console.log(
    "[Obscura][P4] P4 listener loaded successfully."
  );
}


// ==================================================
// Configuration
// ==================================================

const CAPTURE_INTERVAL_MS =
  5000;

const MAX_CAPTURE_ATTEMPTS =
  2;

const MAX_SAVED_PAIRS =
  15;

const P5_ENDPOINT =
  "http://localhost:8000/agent/reason";


// ==================================================
// Task sessions
// ==================================================
//
// Each session:
//
// {
//   id,
//   task,
//   tabId,
//   windowId,
//   running,
//   paused,
//   pauseReason,
//   currentCycleId
// }
//
// ==================================================

const taskSessions =
  new Map();


// ==================================================
// Session scheduler state
// ==================================================
//
// Each session has its own async loop.
//
// This map prevents accidental duplicate loops.
// ==================================================

const runningSessionLoops =
  new Set();


// ==================================================
// Confirmation state
// ==================================================
//
// requestId → {
//   senderId,
//   tabId,
//   sessionId
// }
// ==================================================

const pendingConfirmations =
  new Map();


// ==================================================
// Runtime messages
// ==================================================

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

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


    // ----------------------------------------------
    // Popup → P1
    // ----------------------------------------------

    if (
      message?.type ===
      "STOP_CAPTURE"
    ) {

      stopCaptureLoop();

      return false;
    }


    // ----------------------------------------------
    // P4_INPUT
    // ----------------------------------------------

    if (
      message?.type ===
      "P4_INPUT"
    ) {

      if (
        typeof globalThis.handleP4Input !==
        "function"
      ) {

        sendResponse({

          valid:
            false,

          error:
            "P4 listener is not loaded."
        });

        return false;
      }


      try {

        const result =
          globalThis.handleP4Input(
            message.payload,
            message.task
          );


        sendResponse(
          result
        );

      } catch (error) {

        console.error(
          "[P4] P4_INPUT processing failed:",
          error
        );


        sendResponse({

          valid:
            false,

          error:
            error?.message ||
            "P4 processing failed."
        });
      }


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
        message.result ||
        message
      );

      return false;
    }


    return false;
  }
);


// ==================================================
// Start NEW task session
// ==================================================

async function startCaptureLoop(
  task
) {

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
  // Get the active tab ONLY when a NEW task starts.
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


  const taskText =
    task.trim();


  // ----------------------------------------------
  // If this exact tab already owns a task,
  // stop that task before replacing it.
  //
  // Different tabs can run independently.
  // ----------------------------------------------

  const existingSession =
    findSessionByTabId(
      taskTab.id
    );


  if (
    existingSession
  ) {

    stopTaskSession(
      existingSession.id,
      "Previous task on this tab was replaced by a new task."
    );
  }


  // ----------------------------------------------
  // Create a new independent task session.
  // ----------------------------------------------

  const sessionId =
    crypto.randomUUID();


  const session = {

    id:
      sessionId,

    task:
      taskText,

    tabId:
      taskTab.id,

    windowId:
      taskTab.windowId ??
      null,

    running:
      true,

    paused:
      false,

    pauseReason:
      null,

    currentCycleId:
      null

  };


  taskSessions.set(
    sessionId,
    session
  );


  resetPrivacyCounters();


  console.log(
    "[Obscura] New task session started:",
    session
  );


  notifyPopup(
    `Capture loop started on tab ${session.tabId}.`
  );


  // ----------------------------------------------
  // Start this session's independent loop.
  // ----------------------------------------------

  runTaskSession(
    session
  ).catch(
    error => {

      console.error(
        "[Obscura] Task session crashed:",
        error
      );

      stopTaskSession(
        session.id,
        "Task session stopped because of an unexpected error."
      );
    }
  );
}


// ==================================================
// Run one task session
// ==================================================

async function runTaskSession(
  session
) {

  if (
    runningSessionLoops.has(
      session.id
    )
  ) {

    return;
  }


  runningSessionLoops.add(
    session.id
  );


  try {

    while (
      session.running
    ) {

      // ------------------------------------------
      // Paused sessions wait here.
      // ------------------------------------------

      if (
        session.paused
      ) {

        await sleep(
          500
        );

        continue;
      }


      // ------------------------------------------
      // Verify the task tab still exists.
      // ------------------------------------------

      const taskTab =
        await getSessionTab(
          session
        );


      if (
        !taskTab ||
        !taskTab.id
      ) {

        stopTaskSession(
          session.id,
          "Task stopped because its original tab was closed."
        );

        break;
      }


      // ------------------------------------------
      // Run a complete cycle on THIS session's tab.
      //
      // The active tab is irrelevant here.
      // ------------------------------------------

      const outcome =
        await runCaptureCycle(
          session
        );


      if (
        !session.running
      ) {

        break;
      }


      if (
        outcome ===
        "DONE"
      ) {

        stopTaskSession(
          session.id,
          "Task completed successfully."
        );

        break;
      }


      if (
        outcome ===
        "PAUSED"
      ) {

        continue;
      }


      // ------------------------------------------
      // Fresh cycle after interval.
      // ------------------------------------------

      await sleep(
        CAPTURE_INTERVAL_MS
      );
    }

  } finally {

    runningSessionLoops.delete(
      session.id
    );

    if (
      !session.running
    ) {

      taskSessions.delete(
        session.id
      );
    }
  }
}


// ==================================================
// Stop ALL task sessions
// ==================================================

function stopCaptureLoop() {

  if (
    taskSessions.size === 0
  ) {

    notifyPopup(
      "No capture loop is running."
    );

    return;
  }


  for (
    const session of taskSessions.values()
  ) {

    session.running =
      false;

    session.paused =
      false;

    session.currentCycleId =
      null;
  }


  pendingConfirmations.clear();


  notifyPopup(
    "All capture loops stopped."
  );
}


// ==================================================
// Stop one task session
// ==================================================

function stopTaskSession(
  sessionId,
  statusMessage = null
) {

  const session =
    taskSessions.get(
      sessionId
    );


  if (
    !session
  ) {

    return;
  }


  session.running =
    false;

  session.paused =
    false;

  session.pauseReason =
    null;

  session.currentCycleId =
    null;


  console.log(
    "[Obscura] Task session stopped:",
    {
      sessionId,
      tabId:
        session.tabId,
      task:
        session.task
    }
  );


  if (
    statusMessage
  ) {

    notifyPopup(
      statusMessage
    );
  }
}


// ==================================================
// Pause task session
// ==================================================

function pauseTaskSession(
  session,
  reason
) {

  session.paused =
    true;

  session.pauseReason =
    reason;


  console.log(
    "[Obscura] Task session paused:",
    {
      sessionId:
        session.id,

      tabId:
        session.tabId,

      reason
    }
  );


  notifyPopup(
    reason
  );
}


// ==================================================
// Resume task session
// ==================================================

function resumeTaskSession(
  session,
  reason = "Task resumed."
) {

  if (
    !session ||
    !session.running
  ) {

    return;
  }


  session.paused =
    false;

  session.pauseReason =
    null;


  console.log(
    "[Obscura] Task session resumed:",
    {
      sessionId:
        session.id,

      tabId:
        session.tabId
    }
  );


  notifyPopup(
    reason
  );
}


// ==================================================
// Sleep
// ==================================================

function sleep(
  ms
) {

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
// Used ONLY when a NEW task starts.
//
// Never use this to determine the task tab
// for subsequent cycles.
// ==================================================

async function getActiveTab() {

  const [
    tab
  ] =
    await chrome.tabs.query({

      active:
        true,

      currentWindow:
        true

    });


  return tab;
}


// ==================================================
// Find task session by tab
// ==================================================

function findSessionByTabId(
  tabId
) {

  for (
    const session of taskSessions.values()
  ) {

    if (
      session.tabId ===
      tabId &&
      session.running
    ) {

      return session;
    }
  }


  return null;
}


// ==================================================
// Get session tab
// ==================================================

async function getSessionTab(
  session
) {

  if (
    !session ||
    session.tabId ===
      null ||
    session.tabId ===
      undefined
  ) {

    return null;
  }


  try {

    return await chrome.tabs.get(
      session.tabId
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
// Screenshot
//
// IMPORTANT:
//
// captureVisibleTab() captures the active tab.
//
// We therefore use chrome.debugger + CDP for the
// task-bound tab so an inactive task tab can still
// be captured.
//
// ==================================================

async function captureScreenshot(
  tabId
) {

  if (
    !tabId
  ) {

    throw new Error(
      "No task tab ID available for screenshot."
    );
  }


  const debuggee = {

    tabId

  };


  let attached =
    false;


  try {

    await chrome.debugger.attach(
      debuggee,
      "1.3"
    );


    attached =
      true;


    const result =
      await chrome.debugger.sendCommand(
        debuggee,
        "Page.captureScreenshot",
        {

          format:
            "png",

          fromSurface:
            true

        }
      );


    if (
      !result?.data
    ) {

      throw new Error(
        "CDP returned no screenshot data."
      );
    }


    return `data:image/png;base64,${result.data}`;

  } catch (error) {

    console.error(
      "[Obscura] Background-tab screenshot failed:",
      error
    );


    throw new Error(
      `Task-tab screenshot failed: ${
        error?.message ||
        "unknown debugger error"
      }`
    );

  } finally {

    if (
      attached
    ) {

      try {

        await chrome.debugger.detach(
          debuggee
        );

      } catch (detachError) {

        console.warn(
          "[Obscura] Failed to detach debugger:",
          detachError
        );
      }
    }
  }
}


// ==================================================
// Viewport
// ==================================================

async function getViewportState(
  tabId
) {

  return chrome.tabs.sendMessage(
    tabId,
    {
      type:
        "GET_VIEWPORT"
    }
  );
}


// ==================================================
// Viewport comparison
// ==================================================

function sameViewport(
  a,
  b
) {

  return (
    a?.scrollX ===
      b?.scrollX &&

    a?.scrollY ===
      b?.scrollY &&

    a?.innerWidth ===
      b?.innerWidth &&

    a?.innerHeight ===
      b?.innerHeight
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

  if (
    !tabId
  ) {

    return {

      valid:
        false,

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

      valid:
        false,

      error:
        "Empty downstream response."
    };

  } catch (error) {

    console.error(
      "[Obscura] P2/P3 communication failed:",
      error
    );


    return {

      valid:
        false,

      error:
        error?.message ||
        "P2/P3 communication failed."
    };
  }
}


// ==================================================
// P3 → P4
// ==================================================

async function sendToP4(
  payload,
  task
) {

  if (
    !payload ||
    !Array.isArray(
      payload.elements
    )
  ) {

    return {

      valid:
        false,

      error:
        "Invalid P4 payload."
    };
  }


  if (
    typeof task !== "string" ||
    !task.trim()
  ) {

    return {

      valid:
        false,

      error:
        "Missing task for P4."
    };
  }


  if (
    typeof globalThis.handleP4Input !==
    "function"
  ) {

    return {

      valid:
        false,

      error:
        "P4 listener is not loaded."
    };
  }


  const p4Message = {

    type:
      "P4_INPUT",

    payload,

    task:
      task.trim()
  };


  console.log(
    "[P1 → P4] Request:",
    p4Message
  );


  try {

    const response =
      globalThis.handleP4Input(
        payload,
        task.trim()
      );


    console.log(
      "[P4 → P1] Response:",
      response
    );


    return response || {

      valid:
        false,

      error:
        "P4 returned no response."
    };

  } catch (error) {

    console.error(
      "[P1] P4 processing failed:",
      error
    );


    return {

      valid:
        false,

      error:
        error?.message ||
        "P4 processing failed."
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

  if (
    !toP4
  ) {

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


  let data =
    null;


  try {

    data =
      await response.json();

  } catch {

    data =
      null;
  }


  console.log(
    "[P5] HTTP status:",
    status
  );

  console.log(
    "[P5] Response:",
    data
  );


  if (
    status ===
    422
  ) {

    throw new Error(
      "P5 rejected the request (422 malformed payload)."
    );
  }


  if (
    status ===
    502
  ) {

    throw new Error(
      "P5 model response failed validation (502)."
    );
  }


  if (
    status ===
    504
  ) {

    throw new Error(
      "P5 model call timed out (504)."
    );
  }


  if (
    !response.ok
  ) {

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

function validateP5Response(
  data
) {

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
    typeof data !==
      "object"
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
    typeof data.target_id !==
      "string"
  ) {

    throw new Error(
      "P5 returned invalid target_id."
    );
  }


  if (
    data.metadata !== undefined &&
    (
      data.metadata === null ||
      typeof data.metadata !==
        "object"
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
  session
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

      pauseTaskSession(
        session,
        "User input required: a sensitive field needs to be filled manually."
      );


      return "PAUSED";
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
      session.currentCycleId,
      session.tabId
    );


  if (
    !result
  ) {

    notifyPopup(
      "P6 returned no action result."
    );


    return "CONTINUE";
  }


  handleP6Result(
    result
  );


  // ----------------------------------------------
  // Confirmation pending
  // ----------------------------------------------

  if (
    result.status ===
    "CONFIRMATION_PENDING"
  ) {

    pauseTaskSession(
      session,
      "P6 is waiting for user confirmation."
    );


    return "PAUSED";
  }


  return "CONTINUE";
}


// ==================================================
// P1 → P6 action request
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


  if (
    !tabId
  ) {

    return {

      status:
        "FAILED",

      action:
        action.action,

      target_id:
        action.target_id ??
        null,

      reason:
        "No task tab available."
    };
  }


  try {

    const result =
      await chrome.tabs.sendMessage(
        tabId,
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

  if (
    !result
  ) {

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


  if (
    !requestId
  ) {

    console.error(
      "[P1] P6 confirmation missing requestId."
    );

    return;
  }


  const senderTabId =
    sender?.tab?.id ??
    null;


  const session =
    senderTabId !== null
      ? findSessionByTabId(
          senderTabId
        )
      : null;


  pendingConfirmations.set(
    requestId,
    {

      senderId:
        sender?.id ??
        null,

      tabId:
        senderTabId,

      sessionId:
        session?.id ??
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


  if (
    session
  ) {

    pauseTaskSession(
      session,
      `Confirmation required: ${targetSummary}`
    );

  } else {

    notifyPopup(
      `Confirmation required: ${targetSummary}`
    );
  }


  // ----------------------------------------------
  // Background → Popup
  // ----------------------------------------------

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


  if (
    !requestId
  ) {

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


  if (
    !pending
  ) {

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

    if (
      !pending.tabId
    ) {

      throw new Error(
        "Original P6 tab is no longer available."
      );
    }


    await chrome.tabs.sendMessage(
      pending.tabId,
      {

        type:
          "P6_CONFIRMATION_RESPONSE",

        requestId,

        approved

      }
    );


    notifyPopup(
      approved
        ? "Confirmation approved."
        : "Confirmation denied."
    );


    // --------------------------------------------
    // Resume the exact task session that was
    // waiting for this confirmation.
    // --------------------------------------------

    if (
      pending.sessionId
    ) {

      const session =
        taskSessions.get(
          pending.sessionId
        );


      if (
        session &&
        session.running
      ) {

        resumeTaskSession(
          session,
          approved
            ? "Confirmation approved. Task resumed."
            : "Confirmation denied. Task resumed for re-evaluation."
        );
      }
    }

  } catch (error) {

    console.error(
      "[P1] Failed to send confirmation to P6:",
      error
    );


    notifyPopup(
      "Failed to send confirmation response to P6."
    );


    if (
      pending.sessionId
    ) {

      const session =
        taskSessions.get(
          pending.sessionId
        );


      if (
        session
      ) {

        session.paused =
          false;

        session.pauseReason =
          null;
      }
    }
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

  if (
    !toP1
  ) {

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

  if (
    !redactedScreenshot
  ) {

    return;
  }


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


  await saveRedactedScreenshot({

    cycle_id:
      cycleId,

    original_screenshot:
      originalScreenshot,

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
    typeof value !==
      "string"
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
// Save screenshots
// ==================================================

async function saveRedactedScreenshot({
  cycle_id,
  original_screenshot,
  redacted_screenshot
}) {

  try {

    const originalDataUrl =
      normalizeImageData(
        original_screenshot,
        "image/png"
      );


    const redactedDataUrl =
      normalizeImageData(
        redacted_screenshot,
        "image/png"
      );


    const entry = {

      cycleId:
        cycle_id,

      originalId:
        null,

      redactedId:
        null,

      createdAt:
        Date.now()

    };


    if (
      originalDataUrl
    ) {

      entry.originalId =
        await chrome.downloads.download({

          url:
            originalDataUrl,

          filename:
            `obscura-redacted/${cycle_id}-ORIGINAL.png`,

          saveAs:
            false,

          conflictAction:
            "overwrite"

        });
    }


    if (
      redactedDataUrl
    ) {

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
    }


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


    while (
      pairs.length >
      MAX_SAVED_PAIRS
    ) {

      const oldest =
        pairs.shift();


      for (
        const id of [
          oldest?.originalId,
          oldest?.redactedId
        ]
      ) {

        if (
          id == null
        ) {

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
    }


    await chrome.storage.local.set({

      obscuraSavedPairs:
        pairs

    });

  } catch (error) {

    console.error(
      "[Obscura] Failed to save screenshots:",
      error
    );
  }
}


// ==================================================
// ONE complete capture cycle
// ==================================================

async function runCaptureCycle(
  session,
  maxAttempts =
    MAX_CAPTURE_ATTEMPTS
) {

  // ----------------------------------------------
  // Always retrieve the task-bound tab.
  // ----------------------------------------------

  const tab =
    await getSessionTab(
      session
    );


  if (
    !tab ||
    !tab.id
  ) {

    stopTaskSession(
      session.id,
      "Task tab was closed or is no longer available."
    );


    return "STOPPED";
  }


  // ----------------------------------------------
  // P1 creates ONE authoritative cycle ID.
  //
  // Retries reuse this ID.
  // ----------------------------------------------

  const cycleId =
    crypto.randomUUID();


  session.currentCycleId =
    cycleId;


  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {

    notifyPopup(
      `Capturing tab ${session.tabId} (attempt ${attempt}/${maxAttempts})...`
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
      // 2. Capture the TASK TAB.
      //
      // This does NOT depend on which tab the user
      // is currently viewing.
      // ------------------------------------------

      const screenshot =
        await captureScreenshot(
          tab.id
        );


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

        return "CONTINUE";
      }


      // ------------------------------------------
      // 6. Build P1 → P2 payload
      // ------------------------------------------

      const payload =
        buildPayload({

          task:
            session.task,

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

        return "CONTINUE";
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

        return "CONTINUE";
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

        return "CONTINUE";
      }


      // ------------------------------------------
      // 11. P3 → P6 sensitive map
      // ------------------------------------------

      if (
        p23Result.toP6
      ) {

        try {

          await chrome.tabs.sendMessage(
            tab.id,
            {

              type:
                "P6_SENSITIVE_MAP",

              payload:
                p23Result.toP6

            }
          );

        } catch (error) {

          console.error(
            "[P1] Failed to send P6 sensitive map:",
            error
          );

          notifyPopup(
            "P6 sensitive map could not be delivered."
          );
        }
      }


      // ------------------------------------------
      // 12. Preview + save screenshots
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
      // ------------------------------------------

      notifyPopup(
        "Filtering frame in P4..."
      );


      const p4Response =
        await sendToP4(
          p23Result.toP4,
          session.task
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

        return "CONTINUE";
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

        return "CONTINUE";
      }


      // ------------------------------------------
      // 15. P4 → P5
      // ------------------------------------------

      notifyPopup(
        "Sending filtered frame to P5..."
      );


      let p5Action;


      try {

        p5Action =
          await callP5({

            task:
              session.task,

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


        return "CONTINUE";
      }


      // ------------------------------------------
      // 16. P5 → P1 → P6 / wait / done
      // ------------------------------------------

      const outcome =
        await handleP5Action(

          p5Action,

          session

        );


      // ------------------------------------------
      // DONE
      // ------------------------------------------

      if (
        outcome ===
        "DONE"
      ) {

        return "DONE";
      }


      // ------------------------------------------
      // PAUSED
      // ------------------------------------------

      if (
        outcome ===
        "PAUSED"
      ) {

        return "PAUSED";
      }


      // ------------------------------------------
      // Normal cycle completion.
      // ------------------------------------------

      notifyPopup(
        `Cycle ${cycleId} completed on tab ${session.tabId}.`
      );


      console.log(
        `[Obscura] Cycle ${cycleId} completed successfully on tab ${session.tabId}.`
      );


      return "CONTINUE";

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


      return "CONTINUE";
    }
  }


  return "CONTINUE";
}