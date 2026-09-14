// content.js
// P1 → P2 → P3 integration bridge.
//
// P1 sends:
//   P1_CAPTURE_CYCLE
//
// P2 performs:
//   - DOM extraction
//   - screenshot decoding
//   - vision inference
//   - DOM + vision fusion
//
// P3 receives:
//   - P2 elements
//   - original P1 screenshot
//   - P1-authoritative cycle_id
//
// P3 returns:
//   - toP1
//   - toP4
//   - toP6
//
// P1 owns cycle_id.
// This file never creates or replaces it.

import { processFrame } from "./src/index.js";

import { processAction } from "./p6/actionPipeline.js";
import { update as updateSensitiveRegistry } from "./p6/sensitiveRegistry.js";
import { registerConfirmationMessageListener } from "./p6/confirmationFlow.js";

// P6 must run in this content script (not the background service worker)
// because targetResolver.js and executor.js operate on the live page DOM
// via `document`/`window`. This registers P6's own P6_CONFIRMATION_RESPONSE
// listener; it's safe to call more than once.
registerConfirmationMessageListener();


// ==================================================
// P2 perception
// ==================================================

async function runP2Perception(p1Payload) {

  const {
    cycle_id,
    screenshot,
    viewport
  } = p1Payload;


  // ----------------------------------------------
  // Validate P1 input
  // ----------------------------------------------

  if (!cycle_id) {
    throw new Error("Missing cycle_id.");
  }

  if (!screenshot) {
    throw new Error("Missing screenshot.");
  }


  // ==================================================
  // STEP 1 — DOM extraction
  // ==================================================

  const domElements =
    P2DOM.extractAllElements();

  const dom_extracted_at =
    Date.now();


  // ==================================================
  // STEP 2 — Decode screenshot
  // ==================================================

  const image =
    await loadScreenshotImage(screenshot);


  // ==================================================
  // STEP 3 — Vision inference
  // ==================================================

  let session =
    P2Vision.getSession();

  if (!session) {
    session =
      await P2Vision.loadVisionModel();
  }

  const visionDetections =
    await P2Vision.runInference(image);


  // ==================================================
  // STEP 4 — DOM + Vision fusion
  // ==================================================

  const fused =
    P2Fusion.fuseDomAndVision(
      domElements,
      visionDetections
    );


  // ==================================================
  // STEP 5 — Return P2 result
  // ==================================================

  return {

    // P1-owned ID.
    // P2 must never generate or replace this.
    cycle_id,

    dom_extracted_at,

    elements:
      fused.elements,

    vision_only:
      fused.vision_only,

    viewport
  };
}


// ==================================================
// Decode P1 screenshot
// ==================================================

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


    image.src =
      dataUrl;
  });
}


// ==================================================
// Runtime message listener
// ==================================================

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

    // ----------------------------------------------
    // P1 → content.js
    // Get current viewport.
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
    // P3 → P6 sensitive map (relayed through P1)
    // ----------------------------------------------

    if (
      message?.type ===
      "P6_SENSITIVE_MAP"
    ) {

      updateSensitiveRegistry(
        message.payload
      );

      return false;
    }


    // ----------------------------------------------
    // P1 → P6 action request
    //
    // P6's own confirmationFlow.js listener (registered
    // above) handles P6_CONFIRMATION_RESPONSE separately;
    // this only handles the actual action-execution request.
    // ----------------------------------------------

    if (
      message?.type ===
      "P6_ACTION_REQUEST"
    ) {

      const agentAction = {
        action:
          message.action,

        target_id:
          message.target_id ??
          null,

        confidence:
          message.confidence,

        metadata:
          message.metadata ||
          {}
      };

      processAction(
        agentAction
      )
        .then((result) => {

          sendResponse(
            result
          );
        })
        .catch((error) => {

          console.error(
            "[Obscura] P6 processAction failed:",
            error
          );

          sendResponse({
            status:
              "FAILED",

            action:
              agentAction.action,

            target_id:
              agentAction.target_id,

            reason:
              error?.message ||
              "P6_PROCESSING_FAILED"
          });
        });

      // Async — keep the message channel open.
      return true;
    }


    // ----------------------------------------------
    // Ignore everything except P1 capture cycles.
    // ----------------------------------------------

    if (
      message?.type !==
      "P1_CAPTURE_CYCLE"
    ) {

      return false;
    }


    const p1Payload =
      message.payload;


    // ==================================================
    // Validate P1 payload
    // ==================================================

    if (
      !p1Payload?.cycle_id
    ) {

      console.error(
        "[Obscura] P1 payload missing cycle_id."
      );


      sendResponse({

        valid:
          false,

        error:
          "Missing cycle_id"
      });


      return false;
    }


    if (
      !p1Payload?.screenshot
    ) {

      console.error(
        "[Obscura] P1 payload missing screenshot."
      );


      sendResponse({

        valid:
          false,

        cycle_id:
          p1Payload.cycle_id,

        error:
          "Missing screenshot"
      });


      return false;
    }


    console.log(
      "[Obscura] P1 capture received:",
      p1Payload.cycle_id
    );


    // ==================================================
    // P2 → P3
    //
    // This work is asynchronous.
    // return true below keeps the Chrome message
    // channel open until sendResponse() executes.
    // ==================================================

    (async () => {

      try {

        // ==========================================
        // STEP 1 — P2 perception
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
        // Verify P2 preserved P1's ID.
        // ==========================================

        if (
          p2Result.cycle_id !==
          p1Payload.cycle_id
        ) {

          throw new Error(
            "P2 changed the P1 cycle_id."
          );
        }


        // ==========================================
        // STEP 2 — P2 → P3
        //
        // P3 expects frame_id.
        // P1's cycle_id is therefore explicitly mapped
        // to frame_id here.
        //
        // Screenshot remains P1-authoritative.
        // ==========================================

        const p3Result =
          await processFrame({

            frame_id:
              p1Payload.cycle_id,

            timestamp:
              p2Result.dom_extracted_at,

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
        // Verify P3 preserved P1's ID.
        // ==========================================

        if (
          p3Result?.toP4?.frame_id &&
          p3Result.toP4.frame_id !==
            p1Payload.cycle_id
        ) {

          throw new Error(
            "P3 returned a frame_id different from P1 cycle_id."
          );
        }


        // ==========================================
        // STEP 3 — Return P3 outputs to P1
        // ==========================================

        sendResponse({

          valid:
            true,

          cycle_id:
            p1Payload.cycle_id,

          // P2 result retained for P1/debugging.
          perception:
            p2Result,

          // P3 → P4
          toP4:
            p3Result?.toP4,

          // P3 → P1 privacy counters.
          toP1:
            p3Result?.toP1,

          // P3 → P6 sensitive map.
          toP6:
            p3Result?.toP6
        });

      } catch (error) {

        console.error(
          "[Obscura] P2/P3 pipeline failed:",
          error
        );


        sendResponse({

          valid:
            false,

          // Preserve P1's authoritative ID
          // even when the pipeline fails.
          cycle_id:
            p1Payload.cycle_id,

          error:
            error?.message ||
            "P2/P3 processing failed."
        });
      }

    })();


    // ----------------------------------------------
    // IMPORTANT:
    // Keep the Chrome message channel open for
    // asynchronous P2/P3 processing.
    // ----------------------------------------------

    return true;
  }
);