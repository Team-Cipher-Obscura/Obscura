function createFrameId() {
  const randomPart = Math.random().toString(16).slice(2, 8);
  return `f_${randomPart}`;
}

function createPerceptionPayload() {
  return {
    frame_id: createFrameId(),
    timestamp: Date.now(),
    elements: extractAllElements()
  };
}

function capturePerception() {
  const perceptionPayload = createPerceptionPayload();

  console.log(
  "P2 perception payload:",
  JSON.stringify(perceptionPayload, null, 2)
);
}

capturePerception();

setInterval(capturePerception, 2000);