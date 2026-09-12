const { calculateRelevance } = require("./relevance");
const { detectChanges } = require("./changeDetection");

function filterElements(p3Output, task, previousState = {}) {
  const relevanceResults = p3Output.elements.map(element => ({
    element,
    ...calculateRelevance(element, task)
  }));

  const changeResults = detectChanges(
    p3Output.elements,
    previousState
  );

  const changeMap = new Map(
    changeResults.map(result => [
      result.element.id,
      result.changed
    ])
  );

  const filteredElements = relevanceResults
    .filter(result => result.relevant)
    .map(result => ({
      ...result.element,
      changed: changeMap.get(result.element.id) ?? false
    }));

  return {
    frame_id: p3Output.frame_id,
    task,
    elements: filteredElements,
    screenshot: p3Output.screenshot
  };
}

module.exports = {
  filterElements
};