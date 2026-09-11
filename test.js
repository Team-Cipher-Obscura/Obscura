const p3Input = require("./mock/p3-input.json");
const previousState = require("./mock/previous-state.json");

const { calculateRelevance } = require("./src/relevance");
const { detectChanges } = require("./src/changeDetection");
const { filterElements } = require("./src/filter");

const task = "Search flights";

console.log("\n--- P4 Decisions ---\n");

const changeResults = detectChanges(
  p3Input.elements,
  previousState
);

const changeMap = new Map(
  changeResults.map(result => [
    result.element.id,
    result.changed
  ])
);

for (const element of p3Input.elements) {
  const relevance = calculateRelevance(element, task);
  const changed = changeMap.get(element.id);

  console.log(
    element.id,
    "| relevance:", relevance.relevance_score.toFixed(2),
    "| relevant:", relevance.relevant,
    "| changed:", changed,
    "| KEEP:", relevance.relevant || changed
  );
}

console.log("\n--- Final P4 Output ---\n");

const output = filterElements(
  p3Input,
  task,
  previousState
);

console.log(JSON.stringify(output, null, 2));