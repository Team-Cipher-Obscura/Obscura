// P2 — DOM + Vision Perception
// Receives a capture-cycle payload from P1,
// extracts DOM information,
// runs local YOLO vision on P1's screenshot,
// and fuses DOM + vision results.


// --------------------------------------------------
// Convert P1's PNG data URL into an Image
// --------------------------------------------------

function loadScreenshotImage(dataUrl) {
  return new Promise((resolve, reject) => {

    const image = new Image();

    image.onload = () => {
      resolve(image);
    };

    image.onerror = () => {
      reject(new Error("Failed to decode P1 screenshot."));
    };

    image.src = dataUrl;
  });
}


// --------------------------------------------------
// Create complete P2 perception payload
// --------------------------------------------------

async function createPerceptionPayload(p1Payload) {

  const {
    cycle_id,
    screenshot,
    viewport
  } = p1Payload;


  // ----------------------------------------------
  // 1. DOM perception
  // ----------------------------------------------

  const domElements = P2DOM.extractAllElements();

  const dom_extracted_at = Date.now();


  // ----------------------------------------------
  // 2. Decode P1 screenshot
  // ----------------------------------------------

  if (!screenshot) {
    throw new Error("P1 screenshot is missing.");
  }

  const image = await loadScreenshotImage(screenshot);


  console.log(
    "[P2] Screenshot decoded:",
    image.width,
    "x",
    image.height
  );


  // ----------------------------------------------
  // 3. Run YOLO visual inference
  // ----------------------------------------------

  let session = P2Vision.getSession();

  if (!session) {

    console.log(
      "[P2 Vision] Model not ready. Loading model..."
    );

    session = await P2Vision.loadVisionModel();
  }


  const visionDetections =
    await P2Vision.runInference(image);


  console.log(
    "[P2 Vision] Detections:",
    visionDetections
  );


  // ----------------------------------------------
  // 4. Fuse DOM + Vision
  // ----------------------------------------------

  const fused =
    P2Fusion.fuseDomAndVision(
      domElements,
      visionDetections
    );


  // ----------------------------------------------
  // 5. Return P2 result
  // ----------------------------------------------

  return {
    cycle_id,

    dom_extracted_at,

    elements: fused.elements,

    vision_only: fused.vision_only,

    viewport
  };
}


// --------------------------------------------------
// Messages from P1 / background.js
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    // ----------------------------------------------
    // P1 asks for current viewport state
    // ----------------------------------------------

    if (message?.type === "GET_VIEWPORT") {

      sendResponse({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      });

      return false;
    }


    // ----------------------------------------------
    // P1 sends capture cycle
    // ----------------------------------------------

    if (message?.type !== "P1_CAPTURE_CYCLE") {
      return;
    }


    const p1Payload = message.payload;


    // ----------------------------------------------
    // Validate P1 payload
    // ----------------------------------------------

    if (!p1Payload?.cycle_id) {

      console.error(
        "[P2] Missing cycle_id from P1."
      );

      sendResponse({
        valid: false,
        error: "Missing cycle_id"
      });

      return true;
    }


    if (!p1Payload?.screenshot) {

      console.error(
        "[P2] Missing screenshot from P1."
      );

      sendResponse({
        valid: false,
        error: "Missing screenshot"
      });

      return true;
    }


    console.log(
      "[P2] Received capture cycle:",
      p1Payload.cycle_id
    );

    console.log(
      "[P2] Screenshot received:",
      true
    );


    // ----------------------------------------------
    // Run P2 asynchronously
    // ----------------------------------------------

    createPerceptionPayload(p1Payload)
      .then((perceptionPayload) => {

        console.log(
          "[P2] Complete perception payload:",
          perceptionPayload
        );

        sendResponse({
          valid: true,
          payload: perceptionPayload
        });

      })
      .catch((error) => {

        console.error(
          "[P2] Perception failed:",
          error
        );

        sendResponse({
          valid: false,
          error: error.message
        });

      });


    // IMPORTANT:
    // Keep Chrome message channel open for
    // asynchronous P2 processing.

    return true;
  }
);


// --------------------------------------------------
// Preload YOLO model
// --------------------------------------------------

(async () => {

  try {

    await P2Vision.loadVisionModel();

    console.log(
      "[P2 Vision] Model initialization complete."
    );

  } catch (error) {

    console.error(
      "[P2 Vision] Model load failed:",
      error
    );

  }

})();