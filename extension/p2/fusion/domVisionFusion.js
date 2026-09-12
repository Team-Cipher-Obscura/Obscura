function calculateIoU(boxA, boxB) {
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);

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
    intersectionWidth * intersectionHeight;

  const areaA =
    boxA.width * boxA.height;

  const areaB =
    boxB.width * boxB.height;

  const unionArea =
    areaA + areaB - intersectionArea;

  if (unionArea <= 0) {
    return 0;
  }

  return intersectionArea / unionArea;
}
function fuseDomAndVision(
  domElements,
  visionDetections,
  iouThreshold = 0.3
) {
  const fusedElements = [];

  const matchedVisionIndexes =
    new Set();

  for (const domElement of domElements) {
    let bestMatch = null;
    let bestIoU = 0;
    let bestVisionIndex = -1;

    for (
      let i = 0;
      i < visionDetections.length;
      i++
    ) {
      const vision =
        visionDetections[i];

      const iou = calculateIoU(
        domElement.bbox,
        vision.bbox
      );

      if (
        iou >= iouThreshold &&
        iou > bestIoU
      ) {
        bestIoU = iou;
        bestMatch = vision;
        bestVisionIndex = i;
      }
    }

    if (bestMatch) {
      matchedVisionIndexes.add(
        bestVisionIndex
      );

      fusedElements.push({
        ...domElement,

        vision: {
          label: bestMatch.label,
          classId: bestMatch.classId,
          confidence:
            bestMatch.confidence,
          bbox: bestMatch.bbox,
          iou: bestIoU
        }
      });
    } else {
      fusedElements.push({
        ...domElement,

        vision: null
      });
    }
  }

  // Keep visual detections that did not
  // match any DOM element.
  const visionOnly = [];

  for (
    let i = 0;
    i < visionDetections.length;
    i++
  ) {
    if (!matchedVisionIndexes.has(i)) {
      visionOnly.push({
        type: "vision_only",
        vision: visionDetections[i]
      });
    }
  }

  return {
    elements: fusedElements,
    vision_only: visionOnly
  };
}
globalThis.P2Fusion = {
  calculateIoU,
  fuseDomAndVision
};