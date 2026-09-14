import * as ort from "onnxruntime-web";

const MODEL_PATH = chrome.runtime.getURL(
  "p2/vision/yolo26n.onnx"
);

let session = null;

const CLASS_NAMES = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush"
];


// ============================================================
// 1. LOAD YOLO MODEL
// ============================================================

async function loadVisionModel() {
  console.log("[P2 Vision] Loading YOLO26n...");

  // --------------------------------------------------
  // 1. Configure WASM fallback
  // --------------------------------------------------

  ort.env.wasm.numThreads = 1;

  ort.env.wasm.wasmPaths = {
  mjs: chrome.runtime.getURL(
    "p2/vision/ort/ort-wasm-simd-threaded.jsep.mjs"
  ),
  wasm: chrome.runtime.getURL(
    "p2/vision/ort/ort-wasm-simd-threaded.jsep.wasm"
  )
};

  // --------------------------------------------------
  // 2. Try WebGPU first
  // --------------------------------------------------

  if ("gpu" in navigator) {
    try {
      console.log(
        "[P2 Vision] WebGPU detected. Trying WebGPU..."
      );

      session = await ort.InferenceSession.create(
        MODEL_PATH,
        {
          executionProviders: ["webgpu"]
        }
      );

      console.log(
        "[P2 Vision] YOLO26n loaded using WebGPU."
      );

      console.log(
        "[P2 Vision] Execution provider: WebGPU"
      );

      console.log(
        "[P2 Vision] Inputs:",
        session.inputNames
      );

      console.log(
        "[P2 Vision] Outputs:",
        session.outputNames
      );

      return session;

    } catch (error) {

      console.warn(
        "[P2 Vision] WebGPU failed. Falling back to WASM.",
        error
      );
    }

  } else {

    console.warn(
      "[P2 Vision] WebGPU not available. Using WASM."
    );
  }

  // --------------------------------------------------
  // 3. WASM fallback
  // --------------------------------------------------

  try {

    console.log(
      "[P2 Vision] Loading YOLO26n using WASM..."
    );

    session = await ort.InferenceSession.create(
      MODEL_PATH,
      {
        executionProviders: ["wasm"]
      }
    );

    console.log(
      "[P2 Vision] YOLO26n loaded using WASM."
    );

    console.log(
      "[P2 Vision] Execution provider: WASM"
    );

    console.log(
      "[P2 Vision] Inputs:",
      session.inputNames
    );

    console.log(
      "[P2 Vision] Outputs:",
      session.outputNames
    );

    return session;

  } catch (error) {

    console.error(
      "[P2 Vision] WASM fallback also failed.",
      error
    );

    throw error;
  }
}


// ============================================================
// 2. IMAGE → 640×640 TENSOR
// ============================================================

function imageToTensor(image) {
  const SIZE = 640;

  const canvas = document.createElement("canvas");

  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  // Resize original image to 640×640
  ctx.drawImage(
    image,
    0,
    0,
    SIZE,
    SIZE
  );

  const imageData = ctx.getImageData(
    0,
    0,
    SIZE,
    SIZE
  );

  const pixels = imageData.data;

  // YOLO expects CHW:
  // [R channel][G channel][B channel]

  const input = new Float32Array(
    3 * SIZE * SIZE
  );

  const channelSize = SIZE * SIZE;

  for (let i = 0; i < channelSize; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];

    // Normalize 0–255 → 0–1
    input[i] = r / 255.0;
    input[channelSize + i] = g / 255.0;
    input[2 * channelSize + i] = b / 255.0;
  }

  return new ort.Tensor(
    "float32",
    input,
    [1, 3, SIZE, SIZE]
  );
}


// ============================================================
// 3. DECODE YOLO OUTPUT
// ============================================================

function decodeYOLOOutput(
  output,
  confidenceThreshold = 0.25
) {
  const dims = output.dims;
  const data = output.data;

  const numChannels = dims[1];   // 84
  const numCandidates = dims[2]; // 8400
  const numClasses = numChannels - 4;

  const detections = [];

  for (let i = 0; i < numCandidates; i++) {

    // Output layout:
    // [1, channels, candidates]

    const x =
      data[0 * numCandidates + i];

    const y =
      data[1 * numCandidates + i];

    const w =
      data[2 * numCandidates + i];

    const h =
      data[3 * numCandidates + i];


    let bestClass = -1;
    let bestScore = -Infinity;


    // Find highest-confidence class
    for (let c = 0; c < numClasses; c++) {
      const score =
        data[(4 + c) * numCandidates + i];

      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }


    // Ignore low-confidence detections
    if (bestScore < confidenceThreshold) {
      continue;
    }


    // Convert:
    // center x/y + width/height
    //
    // into:
    // top-left x/y + width/height

    detections.push({
  classId: bestClass,
  label: CLASS_NAMES[bestClass] || `class_${bestClass}`,
  confidence: bestScore,
  bbox: {
    x: x - w / 2,
    y: y - h / 2,
    width: w,
    height: h
  }
});
  }

  return detections;
}


// ============================================================
// 4. CALCULATE IoU
// ============================================================

function calculateIoU(boxA, boxB) {

  const x1 = Math.max(
    boxA.x,
    boxB.x
  );

  const y1 = Math.max(
    boxA.y,
    boxB.y
  );

  const x2 = Math.min(
    boxA.x + boxA.width,
    boxB.x + boxB.width
  );

  const y2 = Math.min(
    boxA.y + boxA.height,
    boxB.y + boxB.height
  );


  const intersectionWidth =
    Math.max(0, x2 - x1);

  const intersectionHeight =
    Math.max(0, y2 - y1);


  const intersectionArea =
    intersectionWidth *
    intersectionHeight;


  const areaA =
    boxA.width *
    boxA.height;

  const areaB =
    boxB.width *
    boxB.height;


  const unionArea =
    areaA +
    areaB -
    intersectionArea;


  if (unionArea <= 0) {
    return 0;
  }


  return (
    intersectionArea /
    unionArea
  );
}


// ============================================================
// 5. NON-MAXIMUM SUPPRESSION
// ============================================================

function applyNMS(
  detections,
  iouThreshold = 0.45
) {

  // Highest confidence first
  const sorted = [...detections].sort(
    (a, b) =>
      b.confidence - a.confidence
  );

  const kept = [];


  while (sorted.length > 0) {

    // Keep highest-confidence detection
    const best = sorted.shift();

    kept.push(best);


    // Remove highly-overlapping
    // detections of the same class

    for (
      let i = sorted.length - 1;
      i >= 0;
      i--
    ) {

      const overlap =
        calculateIoU(
          best.bbox,
          sorted[i].bbox
        );


      if (
        best.classId ===
          sorted[i].classId &&
        overlap > iouThreshold
      ) {
        sorted.splice(i, 1);
      }
    }
  }


  return kept;
}


// ============================================================
// 6. MAP 640×640 BBOX → ORIGINAL IMAGE
// ============================================================

function mapBBoxToOriginal(
  bbox,
  originalWidth,
  originalHeight
) {
  const MODEL_SIZE = 640;


  // We currently stretch the entire
  // original image directly to 640×640.
  //
  // Therefore X and Y have separate
  // scale factors.

  const scaleX =
    originalWidth / MODEL_SIZE;

  const scaleY =
    originalHeight / MODEL_SIZE;


  return {
    x: bbox.x * scaleX,

    y: bbox.y * scaleY,

    width: bbox.width * scaleX,

    height: bbox.height * scaleY
  };
}


// ============================================================
// 7. RUN INFERENCE
// ============================================================

async function runInference(image) {

  if (!session) {
    throw new Error(
      "YOLO model is not loaded."
    );
  }


  console.log(
    "[P2 Vision] Preparing image..."
  );


  // STEP A — Image → Tensor

  const inputTensor =
    imageToTensor(image);


  console.log(
    "[P2 Vision] Tensor shape:",
    inputTensor.dims
  );


  // STEP B — YOLO inference

  const feeds = {
    images: inputTensor
  };


  console.log(
    "[P2 Vision] Running YOLO inference..."
  );


  const outputs =
    await session.run(feeds);


  console.log(
    "[P2 Vision] Inference completed."
  );


  console.log(
    "[P2 Vision] Output names:",
    Object.keys(outputs)
  );


  console.log(
    "[P2 Vision] Raw output:",
    outputs.output0
  );


  console.log(
    "[P2 Vision] Output shape:",
    outputs.output0.dims
  );


  // STEP C — Decode

  const detections =
    decodeYOLOOutput(
      outputs.output0
    );


  console.log(
    "[P2 Vision] Decoded detections:",
    detections
  );


  console.log(
    "[P2 Vision] Detection count BEFORE NMS:",
    detections.length
  );


  // STEP D — NMS

  const finalDetections =
    applyNMS(
      detections,
      0.45
    );


  console.log(
    "[P2 Vision] Detections AFTER NMS:",
    finalDetections
  );


  console.log(
    "[P2 Vision] Detection count AFTER NMS:",
    finalDetections.length
  );


  // STEP E — Get original image dimensions

  const originalWidth =
    image.naturalWidth ||
    image.width;

  const originalHeight =
    image.naturalHeight ||
    image.height;


  console.log(
    "[P2 Vision] Original image size:",
    originalWidth,
    "x",
    originalHeight
  );


  // STEP F — Map model coordinates
  // back to original image coordinates

  const mappedDetections =
    finalDetections.map(
      detection => ({
        ...detection,

        bbox:
          mapBBoxToOriginal(
            detection.bbox,
            originalWidth,
            originalHeight
          )
      })
    );


  console.log(
    "[P2 Vision] FINAL mapped detections:",
    mappedDetections
  );


  return mappedDetections;
}


// ============================================================
// 8. EXPOSE P2 VISION API
// ============================================================

globalThis.P2Vision = {

  imageToTensor,

  loadVisionModel,

  runInference,

  decodeYOLOOutput,

  calculateIoU,

  applyNMS,

  mapBBoxToOriginal,

  getSession: () => session

};