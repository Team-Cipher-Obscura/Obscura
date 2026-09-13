// faceDetection.js
// Full-frame face detection via BlazeFace (pretrained, ~400KB, made for
// real-time on-device use — the browser-friendly equivalent of "MediaPipe/
// ONNX" from the spec). Unscoped — runs on the WHOLE screenshot every
// cycle, same rationale as ocr.js.
//
// Extension: WebGL backend for real-time speed, model loaded from the
// extension's own bundled models/blazeface/ via chrome.runtime.getURL —
// zero network dependency at runtime (privacy-focused extension, and this
// sandbox's network blocks the default model host anyway).
//
// Node (npm test / view-redaction.js): pure-JS CPU backend + a manual
// IOHandler reading the same files straight off local disk, since there's
// no tfjs-node in this environment.

import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";
import { toLoadableImage, base64ToOffscreenCanvas } from "../imageUtils.js";

const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.getURL;

let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = isExtension ? loadModelBrowser() : loadModelNode();
  }
  return modelPromise;
}

async function loadModelBrowser() {
  await import("@tensorflow/tfjs-backend-webgl");
  await tf.setBackend("webgl");
  const modelUrl = chrome.runtime.getURL("models/blazeface/model.json");
  return blazeface.load({ modelUrl });
}

async function loadModelNode() {
  await import("@tensorflow/tfjs-backend-cpu");
  await tf.setBackend("cpu");
  const { fileURLToPath } = await import("url");
  const { readFileSync } = await import("fs");
  const dir = fileURLToPath(new URL("../../models/blazeface/", import.meta.url));

  // Minimal manual IOHandler so plain @tensorflow/tfjs (no tfjs-node) can
  // load model files straight off disk in this Node test environment.
  return blazeface.load({
    modelUrl: {
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
    },
  });
}

/**
 * @param {string} imageInput - base64 PNG/JPEG string or data URL (browser);
 *   also accepts a file path in the Node test path via node-canvas.
 * @returns {Promise<Array<{ bbox: {x:number,y:number,width:number,height:number}, confidence: number }>>}
 */
export async function detectFaces(imageInput) {
  if (!imageInput) return [];

  const model = await getModel();
  const source = isExtension
    ? await base64ToOffscreenCanvas(imageInput)
    : await loadNodeCanvas(imageInput);

  const predictions = await model.estimateFaces(source, false);

  return predictions.map((p) => {
    const [x, y] = p.topLeft;
    const [x2, y2] = p.bottomRight;
    return {
      bbox: { x, y, width: x2 - x, height: y2 - y },
      confidence: Array.isArray(p.probability) ? p.probability[0] : p.probability,
    };
  });
}

async function loadNodeCanvas(imageInput) {
  const { createCanvas, loadImage } = await import("canvas");
  const image = await loadImage(toLoadableImage(imageInput));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}
