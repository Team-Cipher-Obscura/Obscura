// test/run.js
// Minimal test runner, zero dependencies. Run with: npm test
// Add more assertions as you build out Steps 4-6.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { checkDomAttribute } from "../src/checks/domAttribute.js";
import { checkRegex } from "../src/checks/regex.js";
import { mergeElementFlags, redactElement } from "../src/redact.js";
import { bboxObjectToArray, buildP1Payload, buildP6Payload } from "../src/output.js";
import { processFrame } from "../src/index.js";
import { terminateOcrWorker } from "../src/checks/ocr.js";
import { fileToBase64 } from "../src/imageUtils.js";
import { existsSync } from "node:fs";

let passed = 0;
let failed = 0;

// Tesseract.js can emit an internal worker error (e.g. on an unreadable
// image) as an unhandled rejection rather than through the normal awaited
// promise chain — without this handler, one bad mock image crashes the
// entire test run instead of just failing that one test.
process.on("unhandledRejection", (err) => {
  console.error(`  FAIL - (unhandled rejection) ${err?.message || err}`);
  failed++;
});
process.on("uncaughtException", (err) => {
  console.error(`  FAIL - (uncaught exception) ${err?.message || err}`);
  failed++;
});

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok - ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log("domAttribute.js");
await test("flags password fields", () => {
  const result = checkDomAttribute({ type: "password" });
  assert.equal(result.sensitive, true);
  assert.equal(result.sensitive_type, "password_field");
});
await test("ignores non-sensitive fields", () => {
  const result = checkDomAttribute({ type: "text" });
  assert.equal(result.sensitive, false);
});

console.log("regex.js");
await test("flags email in free text", () => {
  const result = checkRegex("reach me at a@b.com please");
  assert.equal(result.sensitive, true);
  assert.equal(result.sensitive_type, "email_text");
});
await test("ignores clean text", () => {
  const result = checkRegex("Welcome to the dashboard");
  assert.equal(result.sensitive, false);
});

console.log("redact.js");
await test("dom_attribute wins over regex when both fire", () => {
  const flag = mergeElementFlags(
    { sensitive: true, sensitive_type: "password_field" },
    { sensitive: true, sensitive_type: "email_text" }
  );
  assert.equal(flag.detected_by, "dom_attribute");
});
await test("redacts sensitive element text in place", () => {
  const el = { id: "x1", text: "secret", __rawText: "secret" };
  const flag = { sensitive: true, sensitive_type: "password_field", detected_by: "dom_attribute" };
  const redacted = redactElement(el, flag, new Map());
  assert.equal(redacted.text, "[REDACTED_PASSWORD]");
});

console.log("output.js");
await test("converts bbox object to array", () => {
  assert.deepEqual(bboxObjectToArray({ x: 1, y: 2, width: 3, height: 4 }), [1, 2, 3, 4]);
});
await test("P1 payload counts sensitive elements + OCR hits + faces", () => {
  const els = [{ sensitive: true, sensitive_type: "password_field" }, { sensitive: false }];
  const ocrHits = [{ sensitive_type: "email_text" }];
  const payload = buildP1Payload(els, 1, ocrHits);
  assert.equal(payload.pii_detected_count, 3);
  assert.ok(payload.sensitive_types.includes("face"));
  assert.ok(payload.sensitive_types.includes("email_text"));
});
await test("P6 payload maps sensitive element ids to types", () => {
  const els = [{ id: "el1", sensitive: true, sensitive_type: "email_field" }];
  const payload = buildP6Payload(els);
  assert.deepEqual(payload.sensitive_element_ids, ["el1"]);
  assert.equal(payload.types.el1, "email_field");
});

console.log("index.js (end-to-end against mocks, all real images now)");

await test("password-field.json: DOM check redacts the password element", async () => {
  const frame = JSON.parse(readFileSync(new URL("../mocks/password-field.json", import.meta.url)));
  const result = await processFrame(frame);
  const pwEl = result.toP4.elements.find((e) => e.id === "el_a91f3c");
  assert.equal(pwEl.sensitive, true);
  assert.equal(pwEl.detected_by, "dom_attribute");
  assert.equal(pwEl.text, "[REDACTED_PASSWORD]");
});

await test("email-in-text.json: regex catches it in the element AND OCR catches it in the screenshot", async () => {
  const frame = JSON.parse(readFileSync(new URL("../mocks/email-in-text.json", import.meta.url)));
  const result = await processFrame(frame);
  const emailEl = result.toP4.elements.find((e) => e.id === "el_c11d2a");
  assert.equal(emailEl.sensitive, true);
  assert.equal(emailEl.detected_by, "regex");
  assert.ok(result.toP1.sensitive_types.includes("email_text"), "OCR should also catch the email rendered in the screenshot");
});

await test("clean-page.json: nothing flagged anywhere", async () => {
  const frame = JSON.parse(readFileSync(new URL("../mocks/clean-page.json", import.meta.url)));
  const result = await processFrame(frame);
  assert.equal(result.toP1.pii_detected_count, 0);
  assert.deepEqual(result.toP6.sensitive_element_ids, []);
});

await test("face-in-screenshot.json: real BlazeFace detection on a real photo", async () => {
  const frame = JSON.parse(readFileSync(new URL("../mocks/face-in-screenshot.json", import.meta.url)));
  const result = await processFrame(frame);
  assert.ok(result.toP1.sensitive_types.includes("face"));
  assert.ok(result.toP1.pii_detected_count >= 1);
});

// Any file in mocks/ that isn't one of the 4 named cases above gets picked
// up automatically here — a generic smoke test (confirms the pipeline runs
// without throwing, and prints what it detected) rather than a specific
// assertion, since we don't know in advance what a new mock should contain.
const KNOWN_MOCKS = new Set(["password-field.json", "email-in-text.json", "clean-page.json", "face-in-screenshot.json"]);
const mocksDir = new URL("../mocks/", import.meta.url);
const allMockFiles = readdirSync(mocksDir).filter((f) => f.endsWith(".json"));
const newMockFiles = allMockFiles.filter((f) => !KNOWN_MOCKS.has(f));

if (newMockFiles.length > 0) {
  console.log(`index.js (auto-discovered new mocks: ${newMockFiles.join(", ")})`);
  for (const filename of newMockFiles) {
    await test(`${filename}: pipeline runs without error`, async () => {
      const frame = JSON.parse(readFileSync(new URL(filename, mocksDir)));
      const result = await processFrame(frame);
      console.log(
        `    -> pii_detected_count=${result.toP1.pii_detected_count}, types=[${result.toP1.sensitive_types.join(", ")}]`
      );
      assert.ok(result.toP4.elements, "should produce a P4 payload");
    });
  }
}

// Real end-to-end test against an actual photo, if present on disk
// (generated by the manual test scripts in the walkthrough — see README).
// Skips gracefully if the image isn't there, so this file still runs
// cleanly on a fresh checkout with no /tmp test fixtures.
const REAL_COMPOSITE = "/tmp/test-composite.png";
if (existsSync(REAL_COMPOSITE)) {
  console.log("index.js (end-to-end against a REAL photo + real text)");
  await test("detects both the face and the OCR'd email in a real image", async () => {
    const screenshot = await fileToBase64(REAL_COMPOSITE);
    const result = await processFrame({ frame_id: "f_real", elements: [], screenshot });
    assert.ok(result.toP1.sensitive_types.includes("face"), "should detect the real face");
    assert.ok(result.toP1.sensitive_types.includes("email_text"), "should OCR the real email");
    assert.equal(result._debug.outputWidth, 910, "screenshot width must be unchanged");
    assert.equal(result._debug.outputHeight, 1217, "screenshot height must be unchanged");
  });
}

await terminateOcrWorker();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
