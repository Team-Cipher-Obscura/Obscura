// index.js
// Entry point. Exposes processFrame() so it can be called directly:
//  - test/run.js and view-redaction.js call it against mocks/ for testing
//  - content.js imports it and calls it inside its P1_CAPTURE_CYCLE
//    listener, which owns the actual message wiring and cycle_id handling
//    for the real extension. There is no separate onMessage listener here
//    — an earlier draft of this file had one for a "P2_FRAME" message with
//    no cycle_id, superseded once P1/P3 agreed the elements arrive directly
//    on P1_CAPTURE_CYCLE's payload instead.

import { checkDomAttribute } from "./checks/domAttribute.js";
import { checkRegex } from "./checks/regex.js";
import { runOcr } from "./checks/ocr.js";
import { detectFaces, detectFacesInRegion } from "./checks/faceDetection.js";
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

  let faces = [];
  try {
    faces = await detectFaces(screenshot);

    // Whole-frame pass alone misses small avatar/profile photos (BlazeFace
    // resizes the whole screenshot down to a fixed small input, so a small
    // face shrinks below what it can see). Re-check each <img> element's
    // own region individually, cropped and upscaled, to catch those.
    const imgElements = (elements || []).filter((el) => el.tag === "img" && el.bbox);
    for (const el of imgElements) {
      const cropFaces = await detectFacesInRegion(screenshot, el.bbox);
      faces.push(...cropFaces);
    }

    console.log("[Obscura][P3] detectFaces() returned:", faces.length, faces);
  } catch (err) {
    console.error("[Obscura][P3] detectFaces() THREW:", err);
  }

  const elementRegions = redactedElements
    .filter((el) => el.sensitive && el.bbox)
    .map((el) => el.bbox);
  const regions = [
    ...elementRegions,
    ...ocrHits.map((h) => h.bbox),
    ...faces.map((f) => f.bbox),
  ];

  const { buffer, width, height } = await redactScreenshot(screenshot, regions);
  // Guard invariant from the spec: screenshot is never resized/cropped.
  const sanitizedScreenshot = buffer.toString("base64");

  return {
    toP4: buildP4Payload(frame_id, redactedElements, sanitizedScreenshot),
    toP1: buildP1Payload(redactedElements, faces.length, ocrHits),
    toP6: buildP6Payload(redactedElements),
    _debug: { outputWidth: width, outputHeight: height },
  };
}