// output.js
// Assembles the three outbound payloads from section 5 of the spec:
//   - toP4: full sanitized elements[] (bbox as ARRAY) + sanitized screenshot
//   - toP1: status counters for the popup UI
//   - toP6: map of sensitive element ids -> type (optional, defense-in-depth)

/**
 * Converts P2's bbox object format to the array format P4 expects.
 * P2 sends: { x, y, width, height }
 * P4 wants: [x, y, width, height]
 */
export function bboxObjectToArray(bbox) {
  if (!bbox) return null;
  return [bbox.x, bbox.y, bbox.width, bbox.height];
}

export function buildP4Payload(frameId, redactedElements, sanitizedScreenshot) {
  return {
    frame_id: frameId,
    elements: redactedElements.map((el) => ({
      id: el.id,
      tag: el.tag,
      type: el.type,
      role: el.role,
      text: el.text,
      bbox: bboxObjectToArray(el.bbox),
      confidence: el.confidence,
      sensitive: el.sensitive,
      sensitive_type: el.sensitive_type,
      detected_by: el.detected_by,
    })),
    screenshot: sanitizedScreenshot,
  };
}

export function buildP1Payload(redactedElements, faceCount, ocrHits = [], sentToAiCount = 0) {
  const sensitiveEls = redactedElements.filter((el) => el.sensitive);
  const sensitiveTypes = new Set(sensitiveEls.map((el) => el.sensitive_type));
  for (const hit of ocrHits) sensitiveTypes.add(hit.sensitive_type);
  if (faceCount > 0) sensitiveTypes.add("face");

  const totalDetected = sensitiveEls.length + ocrHits.length + faceCount;

  return {
    privacy_status: "active",
    pii_detected_count: totalDetected,
    redacted_count: totalDetected,
    sensitive_types: [...sensitiveTypes],
    sent_to_ai_count: sentToAiCount,
  };
}

export function buildP6Payload(redactedElements) {
  const sensitiveEls = redactedElements.filter((el) => el.sensitive);
  return {
    sensitive_element_ids: sensitiveEls.map((el) => el.id),
    types: Object.fromEntries(sensitiveEls.map((el) => [el.id, el.sensitive_type])),
  };
}
