const elementIds = new WeakMap();

let nextId = 1;

function getStableId(element) {

  if (elementIds.has(element)) {
    return elementIds.get(element);
  }

  const id = `el_${nextId++}`;

  elementIds.set(element, id);

  return id;
}