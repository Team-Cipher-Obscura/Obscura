function createElementSnapshot(element) {
  return {
    id: element.id,
    text: element.text,
    tag: element.tag,
    type: element.type,
    role: element.role,
    bbox: element.bbox
  };
}

function hasElementChanged(current, previous) {
  if (!previous) {
    return true;
  }

  return (
    current.text !== previous.text ||
    current.tag !== previous.tag ||
    current.type !== previous.type ||
    current.role !== previous.role ||
    JSON.stringify(current.bbox) !== JSON.stringify(previous.bbox)
  );
}

function detectChanges(elements, previousState) {
  return elements.map(element => ({
    element,
    changed: hasElementChanged(
      element,
      previousState[element.id]
    )
  }));
}

function buildPreviousState(elements) {
  const state = {};

  for (const element of elements) {
    state[element.id] = createElementSnapshot(element);
  }

  return state;
}

module.exports = {
  createElementSnapshot,
  hasElementChanged,
  detectChanges,
  buildPreviousState
};