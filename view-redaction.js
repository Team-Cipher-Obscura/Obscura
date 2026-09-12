// Run this to SEE what the pipeline actually does to your mock images.
// Automatically picks up every .json file in mocks/ — add a new mock and
// it'll show up here next run, no code changes needed.
//
// Saves both the original screenshot and the redacted/sanitized version
// side by side in output-images/, so you can open them and compare.
//
// Run: node view-redaction.js

import { processFrame } from "./src/index.js";
import { terminateOcrWorker } from "./src/checks/ocr.js";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";

// Same fix as test/run.js: Tesseract.js can throw an internal worker error
// as an uncaught exception rather than a normal rejection on a bad image —
// without this, one broken mock kills the whole script instead of just
// that one file being reported as failed.
process.on("uncaughtException", (err) => {
  console.log(`  (uncaught) ${err?.message || err} — continuing with remaining files`);
});

mkdirSync("output-images", { recursive: true });

const mockFiles = readdirSync("mocks").filter((f) => f.endsWith(".json"));

if (mockFiles.length === 0) {
  console.log("No .json files found in mocks/ — nothing to do.");
  process.exit(0);
}

for (const filename of mockFiles) {
  const name = filename.replace(/\.json$/, "");
  let frame;
  try {
    frame = JSON.parse(readFileSync(`mocks/${filename}`, "utf8"));
  } catch (e) {
    console.log(`${filename}: SKIPPED (not valid JSON) - ${e.message}`);
    continue;
  }

  if (!frame.screenshot) {
    console.log(`${filename}: SKIPPED (no "screenshot" field)`);
    continue;
  }

  // Save the ORIGINAL screenshot so you can see what went in.
  // We don't know the real format in advance, so just try to detect it
  // from the base64 header rather than assuming .jpg like before.
  const isJpeg = frame.screenshot.startsWith("/9j/");
  const ext = isJpeg ? "jpg" : "png";
  writeFileSync(`output-images/${name}-ORIGINAL.${ext}`, Buffer.from(frame.screenshot, "base64"));

  try {
    const result = await processFrame(frame);
    writeFileSync(`output-images/${name}-REDACTED.png`, Buffer.from(result.toP4.screenshot, "base64"));
    console.log(`${filename}: pii_detected_count=${result.toP1.pii_detected_count}, types=${result.toP1.sensitive_types.join(",")}`);
  } catch (e) {
    console.log(`${filename}: FAILED to process - ${e.message}`);
  }
}

await terminateOcrWorker();
console.log("\nDone. Open the output-images/ folder and compare each -ORIGINAL vs -REDACTED pair.");
