// P2 — Stable DOM Element IDs
// Assigns each live DOM element a stable ID for the current page/runtime.
// The ID is stored internally and also written to the live DOM element
// as data-agent-id so P6 can resolve target_id back to the element.

const elementIds = new WeakMap();

let nextId = 1;

function getStableId(element) {
  // Safety check: only DOM elements can receive stable IDs.
  if (!(element instanceof Element)) {
    return null;
  }

  // Reuse the existing ID if this exact DOM element already has one.
  if (elementIds.has(element)) {
    return elementIds.get(element);
  }

  // Create a new ID for this DOM element.
  const id = `el_${nextId++}`;

  // Keep the internal element → ID mapping.
  elementIds.set(element, id);

  // Expose the same ID on the live DOM element.
  // P6 can later use this to resolve target_id.
  element.dataset.agentId = id;

  return id;
}

// Resolve a target_id back to the current live DOM element.
// Returns null if the element no longer exists.
function getElementByStableId(id) {
  if (!id || typeof id !== "string") {
    return null;
  }

  const element = document.querySelector(
    `[data-agent-id="${CSS.escape(id)}"]`
  );

  return element || null;
}

// Check whether a target_id currently resolves to a live DOM element.
function isStableIdValid(id) {
  return getElementByStableId(id) !== null;
}

globalThis.P2StableIds = {
  getStableId,
  getElementByStableId,
  isStableIdValid
};