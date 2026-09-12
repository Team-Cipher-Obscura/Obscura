# person3-privacy-firewall

Local Privacy Firewall — on-device scan/redact module (Person 3) for the browser agent pipeline.

## Status: Steps 1-7 complete and tested with REAL data

- ✅ DOM-attribute + regex checks (password/email/phone/card/OTP)
- ✅ Real OCR via Tesseract.js — tested against a generated image, correctly
  read an email and a 16-digit card number split across OCR word boundaries
- ✅ Real face detection via BlazeFace (TensorFlow.js) — tested against an
  actual photograph, 99.9% confidence, zero false positives on a text-only image
- ✅ Screenshot redaction (Canvas) — black-box masking over every flagged
  region; verified visually and with a dimensions-preserved guard test
- ✅ All 4 mocks now carry real, valid images (not placeholder strings)
- ✅ 14/14 tests passing, including one real end-to-end run against an
  actual photo containing both a face and a printed email address

**Run it:** `npm test` — no setup needed, models are already bundled in `models/`.

## What's pretrained here (no training was needed or done)

| Task | Model | Why this one |
| --- | --- | --- |
| OCR | Tesseract.js `eng` model | Ships pretrained, works identically in Node and browser |
| Face detection | BlazeFace (TensorFlow.js) | ~400KB, made for real-time on-device detection — the practical browser-extension equivalent of "MediaPipe/ONNX" from the spec |

Both are bundled/cached locally in this project (`models/blazeface/`) because
this sandbox's network blocks the default model CDNs. **In your real dev
environment, this isn't an issue** — `tesseract.js`'s default CDN and
`blazeface.load()`'s default URL will just work. Only fall back to the local
model files if you hit the same kind of network restriction (e.g. a locked-down
CI runner or offline dev box).

## File-by-file status

| File | Status |
| --- | --- |
| `src/checks/domAttribute.js` | Done |
| `src/checks/regex.js` | Done (line-level card detection added to catch OCR's word-splitting) |
| `src/checks/ocr.js` | Done — real Tesseract.js, tested |
| `src/checks/faceDetection.js` | Done — real BlazeFace, tested |
| `src/redact.js` | Done — element redaction + Canvas screenshot masking |
| `src/output.js` | Done — P4/P1/P6 payloads, now also counting OCR hits in P1 |
| `src/index.js` | Done — full `processFrame()` pipeline |
| `src/imageUtils.js` | Done — base64/path/data-URL normalization for all three image consumers |

## What's left — Step 8 and 9 only

**Step 8 — swap mocks for real P2 messages.** Once P2 exists, replace the
`JSON.parse(readFileSync(...))` mock loading in `test/run.js` with real
incoming frames, and confirm P4 passes the screenshot through untouched
(P4's contract to honor, not something to test here).

**Step 9 — wire into the extension.** `index.js` has the `chrome.runtime.onMessage`
listener shape commented at the bottom — uncomment and adapt to P1's messaging
conventions once they're finalized.

**For the browser build specifically:**
- Swap `@tensorflow/tfjs-backend-cpu` for `-webgl` or `-wasm` for real-time speed
  (CPU backend is fine for Node testing, too slow for a live extension)
- Swap `node-canvas`'s `createCanvas`/`loadImage` for native `OffscreenCanvas` +
  `createImageBitmap` — the pixel-manipulation logic is identical
- Consider bundling `models/blazeface/` with the extension rather than fetching
  at runtime, for a privacy-focused extension that shouldn't need network access
  for its core detection to work

## Design invariants (still true, unchanged from the original build plan)

- No relevance gating anywhere in this module — every check runs on every
  element and the full screenshot, every cycle.
- Screenshot is never resized/cropped — verified by a real test comparing
  output dimensions to the known input dimensions (910×1217).
- `bbox` format changes only at the P4 boundary — object in, array out.
- If OCR-on-full-frame proves too slow in real testing, the documented
  fallback is a one-line gating change to scope it to P4's relevant/changed
  regions — not removing detection coverage from the DOM/regex side.
