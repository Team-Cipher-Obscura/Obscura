function getElementText(element) {

  const htmlElement = element;
  const inputElement = element;

  // 1. Input/textarea value — checked first. Otherwise a placeholder or
  // aria-label (very common on CVV/expiry fields, e.g. placeholder="CVV")
  // would shadow the real typed value and regex.js would never see it.
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (inputElement.value && inputElement.value.trim()) {
      return inputElement.value.trim();
    }
  }

  // 2. Visible text
  const visibleText = (htmlElement.innerText || "").trim();

  if (visibleText) {
    return visibleText;
  }

  // 3. ARIA label
  const ariaLabel = element.getAttribute("aria-label");

  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  // 4. Placeholder
  const placeholder = element.getAttribute("placeholder");

  if (placeholder && placeholder.trim()) {
    return placeholder.trim();
  }

  // 5. Alt text
  const alt = element.getAttribute("alt");

  if (alt && alt.trim()) {
    return alt.trim();
  }

  // 6. Title
  const title = element.getAttribute("title");

  if (title && title.trim()) {
    return title.trim();
  }

  return "";
}


function getElementRole(element) {

  // Explicit ARIA role wins
  const explicitRole = element.getAttribute("role");

  if (explicitRole && explicitRole.trim()) {
    return explicitRole.trim();
  }

  const tag = element.tagName.toLowerCase();

  // Semantic HTML roles
  if (tag === "button") {
    return "button";
  }

  if (tag === "a") {
    return "link";
  }

  if (tag === "textarea") {
    return "textbox";
  }

  if (tag === "select") {
    return "combobox";
  }

  if (tag === "input") {

    const type = (
      element.getAttribute("type") || "text"
    ).toLowerCase();

    if (type === "checkbox") {
      return "checkbox";
    }

    if (type === "radio") {
      return "radio";
    }

    if (type === "password") {
      return "textbox";
    }

    return "textbox";
  }

  if (/^h[1-6]$/.test(tag)) {
    return "heading";
  }

  return "";
}


function getViewportBBox(element) {

  const rect = element.getBoundingClientRect();

  // Ignore zero-size elements
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const style = getComputedStyle(element);

  // Ignore hidden elements
  if (style.display === "none") {
    return null;
  }

  if (style.visibility === "hidden") {
    return null;
  }

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}


function extractElementInfo(element) {

  const bbox = getViewportBBox(element);

  if (!bbox) {
    return null;
  }

  return {

    id: getStableId(element),

    tag: element.tagName.toLowerCase(),

    type: element.getAttribute("type"),

    role: getElementRole(element),

    text: getElementText(element),

    autocomplete: element.autocomplete || "",

    bbox: bbox,

    confidence: 1.0

  };
}


function extractAllElements() {

  const candidates = document.querySelectorAll(
  "button, input, textarea, select, a, " +
  "h1, h2, h3, h4, h5, h6, " +
  "img, video, canvas"
);

  const elements = [];

  candidates.forEach((element) => {

    const extracted = extractElementInfo(element);

    if (extracted) {
      elements.push(extracted);
    }

  });

  return elements;
}
globalThis.P2DOM = {
  extractAllElements,
  extractElementInfo,
  getElementText,
  getElementRole,
  getViewportBBox
};