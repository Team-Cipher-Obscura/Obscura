// ocr.js
// Full-frame OCR via Tesseract.js. Unscoped — runs on the WHOLE screenshot,
// every cycle, regardless of task relevance (relevance filtering is P4's job,
// downstream of us, and only applies to elements — pixels can't be
// selectively excluded before OCR the way DOM elements can be skipped).
//
// Pretrained model — Tesseract.js ships its own trained "eng" model and
// downloads it on first use (cached after that). No training required.

import { createWorker } from "tesseract.js";
import { checkRegex } from "./regex.js";
import { toLoadableImage } from "../imageUtils.js";
import { fileURLToPath } from "url";

// Reuse the same regex patterns as element-text checks so OCR-detected
// text is judged sensitive/not-sensitive by the same rules.
export { checkRegex as looksSensitive };

const LOCAL_TESSDATA_DIR = fileURLToPath(new URL("../../models/tessdata/", import.meta.url));

// One worker, reused across frames/cycles — spinning up a worker per frame
// would be far too slow for a real-time pipeline.
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    // langPath points at a LOCAL folder (models/tessdata/), not a URL.
    // This means zero network access at runtime — the model is loaded
    // once, straight off disk, every time. This is the "install once"
    // setup: in the real extension, models/tessdata/ ships as a bundled
    // asset inside the extension package, loaded via
    // chrome.runtime.getURL("models/tessdata/") instead of a local path.
    workerPromise = createWorker("eng", 1, {
      langPath: LOCAL_TESSDATA_DIR,
    });
  }
  return workerPromise;
}

/**
 * @param {string} imageInput - base64 PNG string, data URL, or file path —
 *   anything Tesseract.js's recognize() accepts.
 * @returns {Promise<Array<{ text: string, bbox: {x:number,y:number,width:number,height:number}, sensitive_type: string }>>}
 */
export async function runOcr(imageInput) {
  if (!imageInput) return [];

  const worker = await getWorker();
  const { data } = await worker.recognize(toLoadableImage(imageInput));

  // Line-level first: card numbers ("4111 2222 3333 4444") AND cvv/expiry
  // ("CVV: 123", "exp 04 / 27") are commonly split across separate OCR
  // words, so a single-word regex check never sees the keyword and the
  // digits together. Check each line's full text as a whole for these.
  const cardHits = [];
  const cardWordTexts = new Set(); // individual word tokens absorbed into a card match
  for (const line of data.lines || []) {
    for (const cardMatch of extractCardDigitRuns(line.text)) {
      cardHits.push({ text: cardMatch, bbox: wordBbox(line), sensitive_type: "credit_card_text" });
      for (const token of cardMatch.split(/[\s-]+/)) cardWordTexts.add(token);
    }
  }

  const contextHits = [];
  const contextWordTexts = new Set();
  for (const line of data.lines || []) {
    const check = checkRegex(line.text);
    if (check.sensitive && (check.sensitive_type === "cvv_text" || check.sensitive_type === "card_expiry_text")) {
      contextHits.push({ text: (line.text || "").trim(), bbox: wordBbox(line), sensitive_type: check.sensitive_type });
      for (const token of (line.text || "").split(/\s+/)) contextWordTexts.add(token);
    }
  }

  // Word-level: catches PII fully contained in one token (emails, phone
  // numbers written without internal spaces, OTP-looking codes) — skip any
  // word already absorbed into a line-level match above.
  const wordHits = [];
  for (const word of data.words || []) {
    if (cardWordTexts.has(word.text) || contextWordTexts.has(word.text)) continue;
    const check = checkRegex(word.text);
    if (check.sensitive) {
      wordHits.push({ text: word.text, bbox: wordBbox(word), sensitive_type: check.sensitive_type });
    }
  }

  return [...cardHits, ...contextHits, ...wordHits];
}

function wordBbox(w) {
  return {
    x: w.bbox.x0,
    y: w.bbox.y0,
    width: w.bbox.x1 - w.bbox.x0,
    height: w.bbox.y1 - w.bbox.y0,
  };
}

/**
 * Finds runs of digits (allowing spaces/dashes between groups) in a line of
 * text that total 13-19 digits — a credit-card-like length — regardless of
 * how Tesseract split them into words.
 */
function extractCardDigitRuns(lineText) {
  if (!lineText) return [];
  const candidates = lineText.match(/\d(?:[\d\s-]{9,24})\d/g) || [];
  return candidates.filter((c) => {
    const digitsOnly = c.replace(/[^\d]/g, "");
    return digitsOnly.length >= 13 && digitsOnly.length <= 19;
  });
}

/** Call once at shutdown (or between test runs) to free the worker. */
export async function terminateOcrWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}