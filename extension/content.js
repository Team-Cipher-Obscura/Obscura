const elements = document.querySelectorAll(
  "button, input, textarea, select, a"
);

elements.forEach((element, index) => {
  const extracted = extractElementInfo(element, `el_${index + 1}`);

  console.log("P2 element:", extracted);
});