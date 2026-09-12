// background.js
// P1 - Capture Cycle Coordinator

// One cycle_id represents one logical capture cycle.
// Retries reuse the same cycle_id.


// --------------------------------------------------
// Listen for capture requests
// --------------------------------------------------

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "START_CAPTURE") {
    runCaptureCycle(message.task);
  }

  return false;
});


// --------------------------------------------------
// Get the currently active browser tab
// --------------------------------------------------

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}


// --------------------------------------------------
// Capture only the visible viewport
// --------------------------------------------------

async function captureScreenshot() {
  return await chrome.tabs.captureVisibleTab(null, {
    format: "png"
  });
}


// --------------------------------------------------
// Get the current viewport state from content.js
// --------------------------------------------------

async function getViewportState(tabId) {
  return await chrome.tabs.sendMessage(tabId, {
    type: "GET_VIEWPORT"
  });
}


// --------------------------------------------------
// Check whether the viewport remained unchanged
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
// Build the payload sent from P1 to P2
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
// Send capture payload to P2
//
// P2 listens for:
// "P1_CAPTURE_CYCLE"
//
// tabId is passed explicitly so the payload is sent
// to the same tab that P1 captured.
// --------------------------------------------------

async function sendToDownstream(tabId, payload) {
  if (!tabId) {
    console.error("[Obscura] No tab ID available.");

    return {
      valid: false
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "P1_CAPTURE_CYCLE",
      payload: payload
    });

    console.log(
      "[Obscura] Capture payload sent to P2:",
      payload
    );

    console.log(
      "[Obscura] P2 response:",
      response
    );

    return response || {
      valid: true
    };

  } catch (error) {
    console.error(
      "[Obscura] Failed to send capture payload to P2:",
      error
    );

    return {
      valid: false
    };
  }
}


// --------------------------------------------------
// Notify popup about current status
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
// Run one complete capture cycle
// --------------------------------------------------

async function runCaptureCycle(task, maxAttempts = 2) {
  const tab = await getActiveTab();

  if (!tab || !tab.id) {
    notifyPopup("No active tab found.");
    return;
  }


  // ------------------------------------------------
  // Generate ONE authoritative cycle_id.
  //
  // This is deliberately outside the retry loop.
  // Therefore, retries use the same cycle_id.
  // ------------------------------------------------

  const cycleId = crypto.randomUUID();


  // ------------------------------------------------
  // Capture attempts
  // ------------------------------------------------

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    notifyPopup(
      `Capturing (attempt ${attempt}/${maxAttempts})...`
    );

    try {

      // --------------------------------------------
      // 1. Read viewport before capture
      // --------------------------------------------

      const viewportBefore =
        await getViewportState(tab.id);


      // --------------------------------------------
      // 2. Capture visible viewport screenshot
      // --------------------------------------------

      const screenshot =
        await captureScreenshot();


      // --------------------------------------------
      // 3. Timestamp for this capture
      // --------------------------------------------

      const timestamp = Date.now();


      // --------------------------------------------
      // 4. Read viewport after capture
      // --------------------------------------------

      const viewportAfter =
        await getViewportState(tab.id);


      // --------------------------------------------
      // 5. Validate viewport
      // --------------------------------------------

      if (!sameViewport(
        viewportBefore,
        viewportAfter
      )) {

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

      const payload = buildPayload({
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
      // 7. Send payload to P2
      // --------------------------------------------

      const result =
        await sendToDownstream(tab.id, payload);


      // --------------------------------------------
      // 8. Handle P2 response
      // --------------------------------------------

      if (!result.valid) {

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