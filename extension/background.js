// background.js
// P1 — Capture Cycle Coordinator
//
// Responsibilities:
//   - Start/stop the repeating capture loop
//   - Generate the authoritative cycle_id
//   - Capture the visible viewport
//   - Validate viewport stability
//   - Send P1_CAPTURE_CYCLE to content.js
//   - Receive P2/P3 outputs
//   - Forward P3 outputs to popup / downstream P4 / P6
//   - Save original + redacted screenshots
//
// P1 does NOT:
//   - perform DOM extraction
//   - run vision
//   - perform PII detection
//   - perform redaction
//   - modify cycle_id


// --------------------------------------------------
// Repeating capture state
// --------------------------------------------------

let captureRunning = false;

const CAPTURE_INTERVAL_MS = 5000;


// --------------------------------------------------
// On-disk screenshot rotation
// --------------------------------------------------

const MAX_SAVED_PAIRS = 15;

const savedDownloads = [];
// [{ cycleId, originalId, redactedId }, ...]


// --------------------------------------------------
// Listen for extension messages
// --------------------------------------------------

chrome.runtime.onMessage.addListener((message) => {

  if (message?.type === "START_CAPTURE") {

    startCaptureLoop(message.task);

    return false;
  }


  if (message?.type === "STOP_CAPTURE") {

    stopCaptureLoop();

    return false;
  }


  if (message?.type === "SAVE_REDACTED_SCREENSHOT") {

    saveRedactedScreenshot(message);

    return false;
  }


  return false;
});


// --------------------------------------------------
// Start sequential capture loop
// --------------------------------------------------

async function startCaptureLoop(task) {

  if (captureRunning) {
    return;
  }

  captureRunning = true;

  notifyPopup("Capture loop started.");


  while (captureRunning) {

    // One complete cycle at a time.
    await runCaptureCycle(task);


    if (!captureRunning) {
      break;
    }


    // Wait before beginning the next cycle.
    await sleep(CAPTURE_INTERVAL_MS);
  }


  captureRunning = false;
}


// --------------------------------------------------
// Stop capture loop
// --------------------------------------------------

function stopCaptureLoop() {

  if (!captureRunning) {
    return;
  }

  captureRunning = false;

  notifyPopup("Capture loop stopped.");
}


// --------------------------------------------------
// Simple async delay
// --------------------------------------------------

function sleep(ms) {

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


// --------------------------------------------------
// Get active browser tab
// --------------------------------------------------

async function getActiveTab() {

  const [tab] =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

  return tab;
}


// --------------------------------------------------
// Capture visible viewport
//
// Chrome returns a PNG data URL:
// data:image/png;base64,...
// --------------------------------------------------

async function captureScreenshot() {

  return await chrome.tabs.captureVisibleTab(
    null,
    {
      format: "png"
    }
  );
}


// --------------------------------------------------
// Ask content.js for current viewport
// --------------------------------------------------

async function getViewportState(tabId) {

  return await chrome.tabs.sendMessage(
    tabId,
    {
      type: "GET_VIEWPORT"
    }
  );
}


// --------------------------------------------------
// Check whether viewport stayed unchanged
// --------------------------------------------------

function sameViewport(a, b) {

  return (
    a &&
    b &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.innerWidth === b.innerWidth &&
    a.innerHeight === b.innerHeight
  );
}


// --------------------------------------------------
// Build P1 → P2 capture payload
// --------------------------------------------------

function buildPayload({
  task,
  screenshot,
  tab,
  viewport,
  cycleId,
  timestamp
}) {

  return {

    // P1 is authoritative for this ID.
    cycle_id: cycleId,

    // PNG data URL from captureVisibleTab().
    screenshot,

    tab_url: tab.url,

    viewport: {
      width: viewport.innerWidth,
      height: viewport.innerHeight,
      scroll_x: viewport.scrollX,
      scroll_y: viewport.scrollY
    },

    task,

    timestamp
  };
}


// --------------------------------------------------
// Send P1 capture cycle to content.js
//
// content.js performs:
//   P2 → P3
//
// There is no P2_FRAME message.
// --------------------------------------------------

async function sendToDownstream(
  tabId,
  payload
) {

  if (!tabId) {

    console.error(
      "[Obscura P1] No tab ID available."
    );

    return {
      valid: false,
      error: "No tab ID available."
    };
  }


  try {

    const response =
      await chrome.tabs.sendMessage(
        tabId,
        {
          type: "P1_CAPTURE_CYCLE",
          payload
        }
      );


    console.log(
      "[Obscura P1] Capture payload sent:",
      payload
    );


    console.log(
      "[Obscura P1] P2/P3 response:",
      response
    );


    return response || {
      valid: true
    };

  } catch (error) {

    console.error(
      "[Obscura P1] Failed to send capture payload:",
      error
    );

    return {
      valid: false,
      error: error?.message || "Downstream communication failed."
    };
  }
}


// --------------------------------------------------
// Notify popup
// --------------------------------------------------

function notifyPopup(status) {

  chrome.runtime
    .sendMessage({
      type: "STATUS_UPDATE",
      status
    })
    .catch(() => {});
}


// --------------------------------------------------
// Convert screenshot data URL to bare base64
//
// P3 returns a bare base64 PNG string.
// P1 captureVisibleTab() returns a data URL.
//
// This helper keeps the two formats separate.
// --------------------------------------------------

function dataUrlToBase64(dataUrl) {

  if (!dataUrl) {
    return null;
  }


  if (!dataUrl.startsWith("data:")) {
    return dataUrl;
  }


  const commaIndex =
    dataUrl.indexOf(",");


  if (commaIndex === -1) {
    return dataUrl;
  }


  return dataUrl.slice(
    commaIndex + 1
  );
}


// --------------------------------------------------
// Save original + redacted screenshots
// --------------------------------------------------

async function saveRedactedScreenshot({
  cycle_id,
  original_screenshot,
  redacted_screenshot
}) {

  try {

    if (!cycle_id) {
      throw new Error("Missing cycle_id.");
    }


    const originalBase64 =
      dataUrlToBase64(
        original_screenshot
      );


    const redactedBase64 =
      dataUrlToBase64(
        redacted_screenshot
      );


    const entry = {
      cycleId: cycle_id,
      originalId: null,
      redactedId: null
    };


    // ----------------------------------------------
    // Save original
    // ----------------------------------------------

    if (originalBase64) {

      entry.originalId =
        await chrome.downloads.download({

          url:
            `data:image/png;base64,${originalBase64}`,

          filename:
            `obscura-redacted/${cycle_id}-ORIGINAL.png`,

          saveAs: false,

          conflictAction: "overwrite"
        });
    }


    // ----------------------------------------------
    // Save redacted
    // ----------------------------------------------

    if (redactedBase64) {

      entry.redactedId =
        await chrome.downloads.download({

          url:
            `data:image/png;base64,${redactedBase64}`,

          filename:
            `obscura-redacted/${cycle_id}-REDACTED.png`,

          saveAs: false,

          conflictAction: "overwrite"
        });
    }


    // Only retain the pair if at least one
    // screenshot was successfully saved.
    if (
      entry.originalId !== null ||
      entry.redactedId !== null
    ) {

      savedDownloads.push(entry);
    }


    // ----------------------------------------------
    // Remove oldest pair when over limit
    // ----------------------------------------------

    while (
      savedDownloads.length >
      MAX_SAVED_PAIRS
    ) {

      const oldest =
        savedDownloads.shift();


      for (const id of [
        oldest.originalId,
        oldest.redactedId
      ]) {

        if (id == null) {
          continue;
        }


        try {
          await chrome.downloads.removeFile(id);
        } catch (_) {}


        try {
          await chrome.downloads.erase({ id });
        } catch (_) {}
      }
    }

  } catch (error) {

    console.error(
      "[Obscura P1] Failed to save screenshots:",
      error
    );
  }
}


// --------------------------------------------------
// Run ONE complete capture cycle
// --------------------------------------------------

async function runCaptureCycle(
  task,
  maxAttempts = 2
) {

  const tab =
    await getActiveTab();


  if (!tab || !tab.id) {

    notifyPopup(
      "No active tab found."
    );

    return;
  }


  // ------------------------------------------------
  // ONE authoritative cycle_id
  //
  // All retries for this cycle reuse this ID.
  // ------------------------------------------------

  const cycleId =
    crypto.randomUUID();


  // ------------------------------------------------
  // Capture attempts
  // ------------------------------------------------

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {

    notifyPopup(
      `Capturing (attempt ${attempt}/${maxAttempts})...`
    );


    try {

      // --------------------------------------------
      // 1. Viewport before capture
      // --------------------------------------------

      const viewportBefore =
        await getViewportState(
          tab.id
        );


      // --------------------------------------------
      // 2. Capture screenshot
      // --------------------------------------------

      const screenshot =
        await captureScreenshot();


      // --------------------------------------------
      // 3. Timestamp
      // --------------------------------------------

      const timestamp =
        Date.now();


      // --------------------------------------------
      // 4. Viewport after capture
      // --------------------------------------------

      const viewportAfter =
        await getViewportState(
          tab.id
        );


      // --------------------------------------------
      // 5. Validate viewport
      // --------------------------------------------

      if (
        !sameViewport(
          viewportBefore,
          viewportAfter
        )
      ) {

        if (attempt < maxAttempts) {

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


      // --------------------------------------------
      // 6. Build P1 → P2 payload
      // --------------------------------------------

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


      console.log(
        "[Obscura P1] Capture cycle payload:",
        payload
      );


      // --------------------------------------------
      // 7. P1 → P2 → P3
      // --------------------------------------------

      const result =
        await sendToDownstream(
          tab.id,
          payload
        );


      // --------------------------------------------
      // 8. Handle invalid result
      // --------------------------------------------

      if (!result?.valid) {

        console.error(
          "[Obscura P1] Downstream returned invalid result:",
          result
        );


        if (attempt < maxAttempts) {

          notifyPopup(
            "Downstream reported invalid frame, retrying..."
          );

          continue;
        }


        notifyPopup(
          "Frame invalid after retry - cycle cancelled."
        );

        return;
      }


      // --------------------------------------------
      // 9. Successful cycle
      // --------------------------------------------

      notifyPopup(
        `Cycle ${cycleId} sent successfully.`
      );


      console.log(
        `[Obscura P1] Cycle ${cycleId} completed successfully.`,
        result
      );


      // --------------------------------------------
      // 10. P3 → P1 privacy counters
      // --------------------------------------------

      if (result.toP1) {

        chrome.runtime
          .sendMessage({

            type: "PRIVACY_COUNTERS",

            cycle_id:
              cycleId,

            privacy_status:
              result.toP1.privacy_status,

            pii_detected_count:
              result.toP1.pii_detected_count,

            redacted_count:
              result.toP1.redacted_count,

            sensitive_types:
              result.toP1.sensitive_types,

            sent_to_ai_count:
              result.toP1.sent_to_ai_count
          })
          .catch(() => {});
      }


      // --------------------------------------------
      // 11. P3 → P4
      // --------------------------------------------

      if (result.toP4) {

        chrome.runtime
          .sendMessage({

            type: "P4_INPUT",

            payload:
              result.toP4
          })
          .catch(() => {});
      }


      // --------------------------------------------
      // 12. P3 → P6
      // --------------------------------------------

      if (result.toP6) {

        chrome.runtime
          .sendMessage({

            type: "P6_SENSITIVE_MAP",

            payload:
              result.toP6
          })
          .catch(() => {});
      }


      // --------------------------------------------
      // 13. Update popup preview
      // --------------------------------------------

      if (result.toP4?.screenshot) {

        chrome.runtime
          .sendMessage({

            type:
              "REDACTED_PREVIEW",

            cycle_id:
              cycleId,

            original_screenshot:
              screenshot,

            redacted_screenshot:
              result.toP4.screenshot
          })
          .catch(() => {});


        // ------------------------------------------
        // Also persist the pair on disk.
        // ------------------------------------------

        saveRedactedScreenshot({

          cycle_id:
            cycleId,

          original_screenshot:
            screenshot,

          redacted_screenshot:
            result.toP4.screenshot
        });
      }


      return;

    } catch (error) {

      console.error(
        `[Obscura P1] Error during capture attempt ${attempt}:`,
        error
      );


      if (attempt < maxAttempts) {

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