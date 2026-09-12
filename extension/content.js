// content.js
// P1/P2 integration backbone.


// --------------------------------------------------
// Handle messages from P1/background.js
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    // ----------------------------------------------
    // P1 asks for current viewport state
    // ----------------------------------------------

    if (message.type === "GET_VIEWPORT") {

      sendResponse({
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      });

      return false;
    }


    // ----------------------------------------------
    // P1 sends a capture cycle to P2
    // ----------------------------------------------

    if (message.type === "P1_CAPTURE_CYCLE") {

      const payload = message.payload;

      if (!payload || !payload.cycle_id) {

        console.error(
          "[Obscura] Invalid capture payload received."
        );

        sendResponse({
          valid: false
        });

        return false;
      }


      console.log(
        "[Obscura] P2 received capture cycle:",
        payload.cycle_id
      );

      console.log(
        "[Obscura] Screenshot received:",
        Boolean(payload.screenshot)
      );


      // ----------------------------------------------
      // P2 DOM extraction will be integrated here.
      //
      // P2 should use:
      //
      // payload.cycle_id
      //
      // as the authoritative identifier.
      //
      // The eventual P2 output should be:
      //
      // {
      //   cycle_id: payload.cycle_id,
      //   dom_extracted_at: Date.now(),
      //   elements: [...]
      // }
      //
      // P2 must NOT create a separate frame_id.
      // ----------------------------------------------

      sendResponse({
        valid: true,
        cycle_id: payload.cycle_id
      });

      return false;
    }
  }
);