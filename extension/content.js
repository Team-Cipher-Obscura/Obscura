// P2 — DOM + Vision Perception
// Receives a capture-cycle payload from P1,
// extracts DOM information,
// runs local YOLO vision on P1's screenshot,
// and fuses DOM + vision results.
//
// P1 remains responsible for:
//   - generating cycle_id
//   - capturing the screenshot
//   - sending P1_CAPTURE_CYCLE
//
// P2 is responsible for:
//   - DOM extraction
//   - local vision inference
//   - DOM + vision fusion
//   - returning the perception payload
//
// P2 does NOT modify cycle_id.


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
      reject(
        new Error(
          "Failed to decode P1 screenshot."
        )
      );
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
  // Validate P1 payload
  // ----------------------------------------------

  if (!cycle_id) {
    throw new Error("Missing cycle_id.");
  }

  if (!screenshot) {
    throw new Error("Missing screenshot.");
  }


  // ----------------------------------------------
  // 1. DOM extraction
  // ----------------------------------------------

  const domElements =
    P2DOM.extractAllElements();

  const dom_extracted_at =
    Date.now();


  // ----------------------------------------------
  // 2. Decode P1 screenshot
  // ----------------------------------------------

  const image =
    await loadScreenshotImage(screenshot);


  console.log(
    "[P2] Screenshot decoded:",
    image.width,
    "x",
    image.height
  );


  // ----------------------------------------------
  // 3. Local YOLO vision inference
  // ----------------------------------------------

  let session =
    P2Vision.getSession();

  if (!session) {

    console.log(
      "[P2 Vision] Model not ready. Loading model..."
    );

    session =
      await P2Vision.loadVisionModel();
  }


  const visionDetections =
    await P2Vision.runInference(image);


  console.log(
    "[P2 Vision] Detections:",
    visionDetections
  );


  // ----------------------------------------------
  // 4. DOM + Vision fusion
  // ----------------------------------------------

  const fused =
    P2Fusion.fuseDomAndVision(
      domElements,
      visionDetections
    );


  // ----------------------------------------------
  // 5. Build P2 perception payload
  // ----------------------------------------------

  return {

    // P1-generated ID is preserved exactly.
    cycle_id,

    // Time when P2 extracted the DOM.
    dom_extracted_at,

    // DOM elements enriched with vision evidence.
    elements:
      fused.elements,

    // Visual detections that did not match a DOM element.
    vision_only:
      fused.vision_only,

    // Viewport information received from P1.
    viewport
  };
}


// --------------------------------------------------
// Messages from P1
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {


    // ----------------------------------------------
    // P1 asks for current viewport state
    // ----------------------------------------------

    if (message?.type === "GET_VIEWPORT") {

      sendResponse({

        scrollX:
          window.scrollX,

        scrollY:
          window.scrollY,

        innerWidth:
          window.innerWidth,

        innerHeight:
          window.innerHeight

      });

      return false;
    }


    // ----------------------------------------------
    // Ignore unrelated messages
    // ----------------------------------------------

    if (
      message?.type !==
      "P1_CAPTURE_CYCLE"
    ) {
      return;
    }


    const p1Payload =
      message.payload;


    // ----------------------------------------------
    // Validate cycle_id
    // ----------------------------------------------

    if (!p1Payload?.cycle_id) {

      console.error(
        "[P2] Missing cycle_id from P1."
      );

      sendResponse({

        valid: false,

        error:
          "Missing cycle_id"

      });

      return false;
    }


    // ----------------------------------------------
    // Validate screenshot
    // ----------------------------------------------

    if (!p1Payload?.screenshot) {

      console.error(
        "[P2] Missing screenshot from P1."
      );

      sendResponse({

        valid: false,

        error:
          "Missing screenshot"

      });

      return false;
    }


    console.log(
      "[P2] Received capture cycle:",
      p1Payload.cycle_id
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

          payload:
            perceptionPayload

        });

      })

      .catch((error) => {

        console.error(
          "[P2] Perception failed:",
          error
        );


        sendResponse({

          valid: false,

          error:
            error?.message ||
            "P2 perception failed."

        });

      });


    // ----------------------------------------------
    // Keep Chrome message channel open because
    // P2 processing is asynchronous.
    // ----------------------------------------------

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