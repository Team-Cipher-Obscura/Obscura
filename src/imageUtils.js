// imageUtils.js
// The spec's frame payload carries the screenshot as a base64 PNG string.
// Our manual tests during development used file paths directly (simpler to
// point at a real image on disk). Both should just work everywhere —
// this converts a base64 string into something node-canvas's loadImage()
// and Tesseract.js's recognize() both accept without extra plumbing.

export function toLoadableImage(input) {
  if (!input) return input;

  // Already a data URL — pass through as-is.
  if (input.startsWith("data:")) return input;

  // A real file path or URL is always short. Base64 image data starts with
  // "/9j/" (JPEG) or "iVBOR" (PNG) etc. and runs into the thousands of
  // characters — so length, not the leading character, is what
  // distinguishes a path from base64. (A bug caught during testing: "/9j/..."
  // was being mistaken for a filesystem path because it starts with "/".)
  const looksLikePath =
    input.length < 1024 &&
    (input.startsWith("/") || input.startsWith("./") || input.startsWith("http"));
  if (looksLikePath) return input;

  // Bare base64 string (what P2/P4 actually send, per the spec) — wrap it.
  // Sniff PNG vs JPEG from the base64 header so the mime type is correct.
  const mime = input.startsWith("/9j/") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${input}`;
}

/** Reads a file path into a bare base64 string, for building test frames. */
export async function fileToBase64(path) {
  const { readFileSync } = await import("fs");
  return readFileSync(path).toString("base64");
}

/**
 * Browser-only. Decodes a base64/data-URL image into an OffscreenCanvas,
 * using only APIs that exist in a content script (no Node Buffer, no
 * node-canvas). Shared by redact.js and faceDetection.js so both draw the
 * frame exactly the same way.
 */
export async function base64ToOffscreenCanvas(input) {
  const raw = input.startsWith("data:") ? input.slice(input.indexOf(",") + 1) : input;
  const mime = raw.startsWith("/9j/") ? "image/jpeg" : "image/png";

  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const blob = new Blob([bytes], { type: mime });
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  return canvas;
}

/**
 * Browser-only. Encodes an ArrayBuffer as base64 without Node's Buffer —
 * btoa only accepts a binary string, so bytes are chunked through
 * String.fromCharCode to avoid blowing the call stack on large screenshots.
 */
export function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
