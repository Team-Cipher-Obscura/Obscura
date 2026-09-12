// faceDetection.js
// Full-frame face detection via BlazeFace (pretrained, ~400KB, made for
// real-time on-device use — the browser-friendly equivalent of "MediaPipe/
// ONNX" from the spec). Unscoped — runs on the WHOLE screenshot every
// cycle, same rationale as ocr.js.
//
// NODE (this file, for local testing) uses the pure-JS CPU backend and a
// locally cached copy of the model (see models/blazeface/ and the loader
// below) because this sandbox's network blocks the default model host
// (storage.googleapis.com / tfhub.dev).
//
// BROWSER (the real extension) should instead:
//   - use '@tensorflow/tfjs-backend-webgl' or '-wasm' for real-time speed
//   - let blazeface.load() hit its default CDN URL (unblocked for a real
//     user's browser) OR bundle the model files with the extension so
//     there's zero network dependency at runtime — recommended for a
//     privacy-focused extension anyway.

import "@tensorflow/tfjs-backend-cpu";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { createCanvas, loadImage } from "canvas";
import { toLoadableImage } from "../imageUtils.js";

const LOCAL_MODEL_DIR = fileURLToPath(new URL("../../models/blazeface/", import.meta.url));

let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend("cpu");
      // In the browser extension, swap this for the default CDN URL (or a
      // bundled-with-the-extension copy) — this manual file handler exists
      // only because this Node test environment has no network access to
      // the default model host and no tfjs-node for its built-in file loader.
      return blazeface.load({ modelUrl: localModelIOHandler(LOCAL_MODEL_DIR) });
    })();
  }
  return modelPromise;
}

// Minimal manual IOHandler so plain @tensorflow/tfjs (no tfjs-node) can load
// model files straight off disk in this Node test environment.
function localModelIOHandler(dir) {
  return {
    load: async () => {
      const modelJson = JSON.parse(readFileSync(dir + "model.json", "utf8"));
      const manifest = modelJson.weightsManifest[0];
      const buffers = manifest.paths.map((p) => readFileSync(dir + p));
      const weightData = Buffer.concat(buffers).buffer;
      return {
        modelTopology: modelJson.modelTopology,
        weightSpecs: manifest.weights,
        weightData,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
      };
    },
  };
}

/**
 * @param {string} imagePath - path to a PNG/JPEG file (base64 data URLs also
 *   accepted in the browser version; this Node version reads from disk via
 *   node-canvas for testing).
 * @returns {Promise<Array<{ bbox: {x:number,y:number,width:number,height:number}, confidence: number }>>}
 */
export async function detectFaces(imagePath) {
  if (!imagePath) return [];

  const model = await getModel();
  const image = await loadImage(toLoadableImage(imagePath));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  const predictions = await model.estimateFaces(canvas, false);

  return predictions.map((p) => {
    const [x, y] = p.topLeft;
    const [x2, y2] = p.bottomRight;
    return {
      bbox: { x, y, width: x2 - x, height: y2 - y },
      confidence: Array.isArray(p.probability) ? p.probability[0] : p.probability,
    };
  });
}
