const { filterElements } = require("./src/filter");
const { buildPreviousState } = require("./src/changeDetection");

console.log("[P4] Listener loaded");

let previousState = {};

function handleP4Input(payload, task) {

  console.log("[P4] Processing P4_INPUT:", {
    task,
    frame_id: payload?.frame_id
  });

  // Validate payload.
  if (!payload || !Array.isArray(payload.elements)) {
    console.error("[P4] Invalid payload:", payload);

    return {
      valid: false,
      error: "Invalid P4_INPUT payload"
    };
  }

  // Validate task.
  if (typeof task !== "string" || task.trim() === "") {
    console.error("[P4] Missing task:", task);

    return {
      valid: false,
      error: "Missing task"
    };
  }

  const result = filterElements(
    payload,
    task,
    previousState
  );

  console.log("[P4] Filtered result:", result);

  previousState = buildPreviousState(
    payload.elements
  );

  return {
    valid: true,
    result
  };
}

// Expose P4 to the existing background service worker.
globalThis.handleP4Input = handleP4Input;