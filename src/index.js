// index.js
// Entry point. In the real extension this listens for messages from P2
// (chrome.runtime.onMessage or similar). For now it exposes a plain
// `processFrame` function so it can be tested with mocks/ payloads before
// P1's messaging layer exists (Step 9).

import { checkDomAttribute } from "./checks/domAttribute.js";
import { checkRegex } from "./checks/regex.js";
import { runOcr } from "./checks/ocr.js";
import { detectFaces } from "./checks/faceDetection.js";
import { mergeElementFlags, redactElement, redactScreenshot } from "./redact.js";
import { buildP4Payload, buildP1Payload, buildP6Payload } from "./output.js";

// Cache of previously-redacted elements, keyed by element id, for reuse
// across cycles (see redact.js's elementChanged()).
const redactionCache = new Map();

/**
 * Processes one P2 frame end to end and returns the three outbound payloads.
 * @param {object} frame - { frame_id, timestamp, elements, screenshot }
 */
export async function processFrame(frame) {
  const { frame_id, elements, screenshot } = frame;

  // Step 4: every element, every cycle, no gating.
  const redactedElements = elements.map((el) => {
    const domResult = checkDomAttribute(el);
    const regexResult = checkRegex(el.text);
    const flag = mergeElementFlags(domResult, regexResult);
    return redactElement({ ...el, __rawText: el.text }, flag, redactionCache);
  });

  // Full-frame, unscoped OCR + face detection — always, regardless of
  // whether any element above was flagged relevant/sensitive.
  const ocrHits = await runOcr(screenshot);
  const faces = await detectFaces(screenshot);
  const regions = [...ocrHits.map((h) => h.bbox), ...faces.map((f) => f.bbox)];

  const { buffer, width, height } = await redactScreenshot(screenshot, regions);
  // Guard invariant from the spec: screenshot is never resized/cropped.
  // (In the browser build, compare against the *decoded* input image's
  // natural dimensions the same way — this check must never be skipped.)
  const sanitizedScreenshot = buffer.toString("base64");

  return {
    toP4: buildP4Payload(frame_id, redactedElements, sanitizedScreenshot),
    toP1: buildP1Payload(redactedElements, faces.length, ocrHits),
    toP6: buildP6Payload(redactedElements),
    _debug: { outputWidth: width, outputHeight: height },
  };
}

// Real extension wiring (Step 9). Guarded by `typeof chrome !== "undefined"`
// so this file still works when imported directly in Node for testing
// (test/run.js, view-redaction.js) — the listener only activates when
// actually running as the extension's background script.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "P2_FRAME") return;

    processFrame(message.payload).then((result) => {
      // -> Person 4: full sanitized elements + screenshot
      chrome.runtime.sendMessage({ type: "P4_INPUT", payload: result.toP4 });

      // -> Person 1's popup.js listens for a FLAT "PRIVACY_COUNTERS"
      // message (see their popup.js: `message.pii_detected_count`, not
      // `message.payload.pii_detected_count`) — so these fields go
      // directly on the message object, not nested.
      chrome.runtime.sendMessage({
        type: "PRIVACY_COUNTERS",
        pii_detected_count: result.toP1.pii_detected_count,
        redacted_count: result.toP1.redacted_count,
        sent_to_ai_count: result.toP1.sent_to_ai_count,
        // privacy_status and sensitive_types are also here in case their
        // UI wants them later — popup.js currently ignores extra fields.
        privacy_status: result.toP1.privacy_status,
        sensitive_types: result.toP1.sensitive_types,
      });

      // -> Person 6: sensitive element id map (defense-in-depth)
      chrome.runtime.sendMessage({ type: "P6_SENSITIVE_MAP", payload: result.toP6 });
    });

    return true; // keep the message channel open for the async response above
  });
}