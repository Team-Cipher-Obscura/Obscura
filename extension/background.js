// background.js
// P1 - Capture Cycle Coordinator



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

  // Prevent starting a second loop.
  if (captureRunning) {
    return;
  }

  captureRunning = true;

  notifyPopup("Capture loop started.");

  while (captureRunning) {

    // ----------------------------------------------
    // Run exactly one complete cycle.
    // The next cycle cannot start until this returns.
    // ----------------------------------------------

    await runCaptureCycle(task);


    // ----------------------------------------------
    // Stop was requested while the cycle was running.
    // Don't start another cycle.
    // ----------------------------------------------

    if (!captureRunning) {
      break;
    }


    // ----------------------------------------------
    // Wait 5 seconds before the next cycle.
    // ----------------------------------------------

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
// Save original + redacted screenshots
// --------------------------------------------------

async function saveRedactedScreenshot({
  cycle_id,
  original_screenshot,
  redacted_screenshot
}) {

  try {

    const isJpeg =
      original_screenshot?.startsWith("/9j/");

    const originalExt =
      isJpeg ? "jpg" : "png";


    const entry = {
      cycleId: cycle_id,
      originalId: null,
      redactedId: null
    };


    // ----------------------------------------------
    // Save original screenshot
    // ----------------------------------------------

    if (original_screenshot) {

      entry.originalId =
        await chrome.downloads.download({
          url:
            `data:image/${originalExt};base64,${original_screenshot}`,

          filename:
            `obscura-redacted/${cycle_id}-ORIGINAL.${originalExt}`,

          saveAs: false,

          conflictAction: "overwrite"
        });
    }


    // ----------------------------------------------
    // Save redacted screenshot
    // ----------------------------------------------

    if (redacted_screenshot) {

      entry.redactedId =
        await chrome.downloads.download({
          url:
            `data:image/png;base64,${redacted_screenshot}`,

          filename:
            `obscura-redacted/${cycle_id}-REDACTED.png`,

          saveAs: false,

          conflictAction: "overwrite"
        });
    }


    savedDownloads.push(entry);


    // ----------------------------------------------
    // Remove oldest pair when over the limit
    // ----------------------------------------------

    if (savedDownloads.length > MAX_SAVED_PAIRS) {

      const oldest =
        savedDownloads.shift();

      for (const id of [
        oldest.originalId,
        oldest.redactedId
      ]) {

        if (id == null) {
          continue;
        }

        chrome.downloads.removeFile(id)
          .catch(() => {});

        chrome.downloads.erase({ id })
          .catch(() => {});
      }
    }

  } catch (error) {

    console.error(
      "[Obscura] Failed to save screenshots:",
      error
    );
  }
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

    cycle_id: cycleId,

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
// There is NO P2_FRAME message.
//
// content.js performs:
// P2 perception → P3 processing
// --------------------------------------------------

async function sendToDownstream(
  tabId,
  payload
) {

  if (!tabId) {

    console.error(
      "[Obscura] No tab ID available."
    );

    return {
      valid: false
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
      "[Obscura] Capture payload sent:",
      payload
    );


    console.log(
      "[Obscura] Content/P2/P3 response:",
      response
    );


    return response || {
      valid: true
    };

  } catch (error) {

    console.error(
      "[Obscura] Failed to send capture payload:",
      error
    );

    return {
      valid: false,
      error: error.message
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
  // Retries for this cycle reuse this ID.
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
        await getViewportState(tab.id);


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
        await getViewportState(tab.id);


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
          viewport: viewportAfter,
          cycleId,
          timestamp
        });


      console.log(
        "[Obscura] Capture cycle payload:",
        payload
      );


      // --------------------------------------------
      // 7. Send to content.js
      //
      // content.js:
      // P2 → P3
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
        `[Obscura] Cycle ${cycleId} completed successfully.`
      );


      // --------------------------------------------
      // 10. Privacy counters → popup
      // --------------------------------------------

      if (result.toP1) {

        chrome.runtime
          .sendMessage({
            type: "PRIVACY_COUNTERS",

            cycle_id: cycleId,

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
      // 11. P4 payload
      // --------------------------------------------

      if (result.toP4) {

        chrome.runtime
          .sendMessage({
            type: "P4_INPUT",
            payload: result.toP4
          })
          .catch(() => {});
      }


      // --------------------------------------------
      // 12. P6 payload
      // --------------------------------------------

      if (result.toP6) {

        chrome.runtime
          .sendMessage({
            type: "P6_SENSITIVE_MAP",
            payload: result.toP6
          })
          .catch(() => {});
      }


      // --------------------------------------------
      // 13. Update popup screenshots
      // --------------------------------------------

      if (result.toP4?.screenshot) {

        chrome.runtime
          .sendMessage({
            type: "REDACTED_PREVIEW",

            cycle_id: cycleId,

            original_screenshot:
              screenshot,

            redacted_screenshot:
              result.toP4.screenshot
          })
          .catch(() => {});
      }


      return;

    } catch (error) {

      console.error(
        `[Obscura] Error during capture attempt ${attempt}:`,
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