// redact.js
// Takes raw elements + screenshot plus the flags computed by the checks/*
// modules, and produces sanitized versions of both.
//
// Rules from the spec:
//  - sensitive element text replaced in place, e.g. "[REDACTED_EMAIL]"
//  - every flagged region (DOM/regex/OCR/face) blurred/masked on the screenshot
//  - screenshot is NEVER resized or cropped — native dimensions preserved
//    (so bbox coords from P2 stay valid for whoever consumes them downstream)
//  - cache reuse allowed only when an element is unchanged AND was already
//    redacted in a prior cycle — never skipped outright otherwise

const REDACTION_LABELS = {
  password_field: "[REDACTED_PASSWORD]",
  email_field: "[REDACTED_EMAIL]",
  phone_field: "[REDACTED_PHONE]",
  email_text: "[REDACTED_EMAIL]",
  credit_card_text: "[REDACTED_CARD]",
  phone_text: "[REDACTED_PHONE]",
  otp_text: "[REDACTED_OTP]",
};

/**
 * Merge DOM-attribute + regex results for one element into a single verdict.
 * DOM-attribute wins if both fire (it's the more certain signal).
 */
export function mergeElementFlags(domResult, regexResult) {
  if (domResult.sensitive) {
    return { sensitive: true, sensitive_type: domResult.sensitive_type, detected_by: "dom_attribute" };
  }
  if (regexResult.sensitive) {
    return { sensitive: true, sensitive_type: regexResult.sensitive_type, detected_by: "regex" };
  }
  return { sensitive: false, sensitive_type: null, detected_by: null };
}

/**
 * Redacts a single element's text in place given its merged flag.
 * cache: optional Map<elementId, redactedElement> for reuse across cycles.
 */
export function redactElement(element, flag, cache) {
  if (cache && cache.has(element.id) && !elementChanged(element, cache.get(element.id))) {
    return cache.get(element.id);
  }

  const redacted = {
    ...element,
    sensitive: flag.sensitive,
    sensitive_type: flag.sensitive_type,
    detected_by: flag.detected_by,
    text: flag.sensitive
      ? REDACTION_LABELS[flag.sensitive_type] || "[REDACTED]"
      : element.text,
  };

  if (cache) cache.set(element.id, redacted);
  return redacted;
}

function elementChanged(current, cached) {
  // Compare raw text/bbox; if identical, this element is unchanged and the
  // cached redacted version can be reused instead of re-running checks.
  return (
    current.text !== cached.__rawText ||
    JSON.stringify(current.bbox) !== JSON.stringify(cached.bbox)
  );
}

const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.getURL;

/**
 * Blurs/masks flagged regions on the screenshot. Screenshot dimensions
 * always equal input dimensions on output — never resized/cropped.
 *
 * Runs one of two paths depending on environment:
 *  - extension (content script): OffscreenCanvas + createImageBitmap
 *  - Node (npm test / view-redaction.js): node-canvas
 * The pixel-manipulation logic (fillRect black-box mask) is identical in
 * both — only image decode/encode differs.
 *
 * @param {string} imagePath - path or base64 image; a black box is drawn
 *   over each flagged region (simpler and more reliable to verify than a
 *   true gaussian blur, and equally effective for redaction).
 * @param {Array<{x:number,y:number,width:number,height:number}>} regions
 * @returns {Promise<{ buffer: {toString: Function}, width: number, height: number }>}
 */
export async function redactScreenshot(imagePath, regions) {
  return isExtension
    ? redactScreenshotBrowser(imagePath, regions)
    : redactScreenshotNode(imagePath, regions);
}

async function redactScreenshotBrowser(imagePath, regions) {
  const { base64ToOffscreenCanvas, arrayBufferToBase64 } = await import("./imageUtils.js");
  const canvas = await base64ToOffscreenCanvas(imagePath);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "black";
  for (const region of regions || []) {
    if (!region) continue;
    ctx.fillRect(region.x, region.y, region.width, region.height);
  }

  const outBlob = await canvas.convertToBlob({ type: "image/png" });
  const outBuffer = await outBlob.arrayBuffer();
  const base64Out = arrayBufferToBase64(outBuffer);

  // Duck-types node-canvas's Buffer return so index.js's shared
  // `buffer.toString("base64")` call works unmodified in both paths.
  return {
    buffer: { toString: () => base64Out },
    width: canvas.width,
    height: canvas.height,
  };
}

async function redactScreenshotNode(imagePath, regions) {
  const { createCanvas, loadImage } = await import("canvas");
  const { toLoadableImage } = await import("./imageUtils.js");
  const image = await loadImage(toLoadableImage(imagePath));

  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  ctx.fillStyle = "black";
  for (const region of regions || []) {
    if (!region) continue;
    ctx.fillRect(region.x, region.y, region.width, region.height);
  }

  return {
    buffer: canvas.toBuffer("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}
