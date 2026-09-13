const { filterElements } = require("./src/filter");
const { buildPreviousState } = require("./src/changeDetection");

console.log("[P4] Listener loaded");

let previousState = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Ignore everything that is not meant for P4.
  if (message?.type !== "P4_INPUT") {
    return false;
  }

  console.log("[P4] Received P4_INPUT:", message);

  const payload = message.payload;
  const task = message.task;

  // Validate payload.
  if (!payload || !Array.isArray(payload.elements)) {
    console.error("[P4] Invalid payload:", payload);

    sendResponse({
      valid: false,
      error: "Invalid P4_INPUT payload"
    });

    return false;
  }

  // Validate task.
  if (typeof task !== "string" || task.trim() === "") {
    console.error("[P4] Missing task:", task);

    sendResponse({
      valid: false,
      error: "Missing task"
    });

    return false;
  }

  // Run P4 context filtering.
  const result = filterElements(
    payload,
    task,
    previousState
  );

  console.log("[P4] Filtered result:", result);

  // Save current frame as previous state
  // for the next capture cycle.
  previousState = buildPreviousState(payload.elements);

  sendResponse({
    valid: true,
    result
  });

  return false;
});