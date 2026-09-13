// content.js
// P1 → P2 → P3 integration bridge.
//
// Responsibilities:
//   - Receive P1_CAPTURE_CYCLE from P1
//   - Run the existing P2 perception pipeline
//   - Pass P2's elements + P1 screenshot to P3
//   - Return P3's outputs to P1
//
// P1 owns cycle_id.
// This file never generates or modifies cycle_id.

import { processFrame } from "./src/index.js";


// --------------------------------------------------
// P2 perception
//
// P2 is loaded by manifest.json before content.js:
//
//   stableIds.js
//   extractElements.js
//   p2-vision.js
//   domVisionFusion.js
//
// Therefore the existing P2 globals are used here.
// --------------------------------------------------

async function runP2Perception(p1Payload) {

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
    await loadScreenshotImage(
      screenshot
    );


  console.log(
    "[P2] Screenshot decoded:",
    image.width,
    "x",
    image.height
  );


  // ----------------------------------------------
  // 3. Local YOLO vision
  // ----------------------------------------------

  let session =
    P2Vision.getSession();


  if (!session) {

    console.log(
      "[P2 Vision] Model not ready. Loading..."
    );


    session =
      await P2Vision.loadVisionModel();
  }


  const visionDetections =
    await P2Vision.runInference(
      image
    );


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
  // 5. Return P2 perception payload
  // ----------------------------------------------

  return {

    // P1-generated ID preserved exactly.
    cycle_id,

    dom_extracted_at,

    elements:
      fused.elements,

    vision_only:
      fused.vision_only,

    viewport
  };
}


// --------------------------------------------------
// Decode P1 screenshot
// --------------------------------------------------

function loadScreenshotImage(dataUrl) {

  return new Promise((resolve, reject) => {

    const image =
      new Image();


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
// Handle messages from P1
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {


    // ----------------------------------------------
    // P1 asks for current viewport
    // ----------------------------------------------

    if (
      message?.type ===
      "GET_VIEWPORT"
    ) {

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
        "[Obscura] P1 payload missing cycle_id."
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
        "[Obscura] P1 payload missing screenshot."
      );


      sendResponse({

        valid: false,

        error:
          "Missing screenshot"
      });


      return false;
    }


    console.log(
      "[Obscura] P1 capture received:",
      p1Payload.cycle_id
    );


    // ----------------------------------------------
    // P2 → P3
    //
    // Processing is asynchronous, so the
    // message channel stays open.
    // ----------------------------------------------

    (async () => {

      try {

        // ==========================================
        // STEP 1 — P2
        // ==========================================

        const p2Result =
          await runP2Perception(
            p1Payload
          );


        console.log(
          "[Obscura] P2 perception complete:",
          p2Result
        );


        // ==========================================
        // STEP 2 — P3
        // ==========================================
        //
        // P3's processFrame() expects:
        //
        //   frame_id
        //   elements
        //   screenshot
        //
        // P1's cycle_id is passed through as frame_id.
        // ==========================================

        const p3Result =
          await processFrame({

            frame_id:
              p2Result.cycle_id,

            elements:
              p2Result.elements,

            screenshot:
              p1Payload.screenshot
          });


        console.log(
          "[Obscura] P3 processing complete:",
          p3Result
        );


        // ==========================================
        // STEP 3 — Return P2 + P3 results to P1
        // ==========================================

        sendResponse({

          valid: true,

          // Preserve P1's authoritative ID.
          cycle_id:
            p1Payload.cycle_id,

          perception:
            p2Result,

          toP1:
            p3Result.toP1,

          toP4:
            p3Result.toP4,

          toP6:
            p3Result.toP6

        });


      } catch (error) {

        console.error(
          "[Obscura] P2/P3 pipeline failed:",
          error
        );


        sendResponse({

          valid: false,

          cycle_id:
            p1Payload.cycle_id,

          error:
            error?.message ||
            "P2/P3 processing failed."

        });
      }

    })();


    // ----------------------------------------------
    // Keep Chrome message channel open.
    // ----------------------------------------------

    return true;
  }
);


// --------------------------------------------------
// Preload P2 YOLO model
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