// P2 — Stable DOM Element IDs
// Assigns each live DOM element a stable ID for the current page/runtime.
// The ID is stored internally and also written to the element as data-agent-id.

const elementIds = new WeakMap();

let nextId = 1;

function getStableId(element) {
  // Reuse the existing ID if this element was already assigned one.
  if (elementIds.has(element)) {
    return elementIds.get(element);
  }

  // Create a new ID for this DOM element.
  const id = `el_${nextId++}`;

  // Store the mapping internally.
  elementIds.set(element, id);

  // Expose the ID on the live DOM element.
  // This allows P6 to resolve target_id back to the actual element.
  element.dataset.agentId = id;

  return id;
}

// Optional helper for execution/debugging.
// Given an ID such as "el_42", return the live DOM element.
function getElementByStableId(id) {
  if (!id) {
    return null;
  }

  return document.querySelector(
    `[data-agent-id="${CSS.escape(id)}"]`
  );
}

globalThis.P2StableIds = {
  getStableId,
  getElementByStableId
};