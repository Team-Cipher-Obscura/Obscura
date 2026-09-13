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
  console.log("[Obscura][faceDetection] loading model, isExtension:", isExtension);
  try {
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
    console.log("[Obscura][faceDetection] tf backend set to:", tf.getBackend());
  } catch (err) {
    console.error("[Obscura][faceDetection] webgl backend failed, falling back to cpu:", err);
    await import("@tensorflow/tfjs-backend-cpu");
    await tf.setBackend("cpu");
  }
  const modelUrl = chrome.runtime.getURL("models/blazeface/model.json");
  console.log("[Obscura][faceDetection] model URL:", modelUrl);
  try {
    const model = await blazeface.load({ modelUrl });
    console.log("[Obscura][faceDetection] model loaded OK");
    return model;
  } catch (err) {
    console.error("[Obscura][faceDetection] blazeface.load() FAILED:", err);
    throw err;
  }
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
  return predictions.map(toFaceResult).map(padFaceBbox);
}

/**
 * Re-runs detection on just one region of the screenshot (e.g. a single
 * <img> element's bbox), upscaled first. BlazeFace always resizes whatever
 * it's given down to a fixed small internal input — so a small avatar
 * photo (a few dozen px) inside a full-page screenshot shrinks to almost
 * nothing and never gets detected by a single whole-frame pass. Cropping
 * to just that element and upscaling it first gives the model a much
 * larger, clearer view of that one face.
 * Browser-only (extension) — the Node path only exists for whole-frame
 * test/script usage and doesn't need this.
 * @param {string} imageInput
 * @param {{x:number,y:number,width:number,height:number}} region - in the
 *   same pixel coordinate space as the full screenshot.
 */
export async function detectFacesInRegion(imageInput, region) {
  if (!isExtension || !imageInput || !region || region.width <= 0 || region.height <= 0) {
    return [];
  }

  const model = await getModel();
  const fullSource = await base64ToOffscreenCanvas(imageInput);

  const targetSize = 256; // upscale target so small avatars are legible to the model
  const scale = Math.max(1, targetSize / Math.max(region.width, region.height));
  const cropW = Math.round(region.width * scale);
  const cropH = Math.round(region.height * scale);

  const cropCanvas = new OffscreenCanvas(cropW, cropH);
  cropCanvas
    .getContext("2d")
    .drawImage(fullSource, region.x, region.y, region.width, region.height, 0, 0, cropW, cropH);

  const predictions = await model.estimateFaces(cropCanvas, false);

  // Map bboxes from crop-local coordinates back into full-screenshot coordinates.
  return predictions
    .map(toFaceResult)
    .map((f) => ({
      ...f,
      bbox: {
        x: region.x + f.bbox.x / scale,
        y: region.y + f.bbox.y / scale,
        width: f.bbox.width / scale,
        height: f.bbox.height / scale,
      },
    }))
    .map(padFaceBbox);
}

function toFaceResult(p) {
  const [x, y] = p.topLeft;
  const [x2, y2] = p.bottomRight;
  return {
    bbox: { x, y, width: x2 - x, height: y2 - y },
    confidence: Array.isArray(p.probability) ? p.probability[0] : p.probability,
  };
}

// BlazeFace's raw box only spans roughly eyebrows-to-nose — nowhere near
// the full head. Pad it out generously (more on top, for hair/forehead)
// so the redacted region actually covers the whole face.
function padFaceBbox(face) {
  const { bbox } = face;
  const padX = bbox.width * 0.5;
  const padTop = bbox.height * 0.9;
  const padBottom = bbox.height * 0.6;
  return {
    ...face,
    bbox: {
      x: bbox.x - padX,
      y: bbox.y - padTop,
      width: bbox.width + padX * 2,
      height: bbox.height + padTop + padBottom,
    },
  };
}

async function loadNodeCanvas(imageInput) {
  const { createCanvas, loadImage } = await import("canvas");
  const image = await loadImage(toLoadableImage(imageInput));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}
