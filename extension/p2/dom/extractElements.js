function extractElementInfo(element, id) {
  const rect = element.getBoundingClientRect();

  return {
    id: id,
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute("type"),
    role: element.getAttribute("role") || "",
    text: element.innerText ? element.innerText.trim() : "",
    bbox: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    confidence: 1.0
  };
}