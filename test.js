const cycle1Input = require("./mock/p3-input.json");
const cycle2Input = require("./mock/p3-input-cycle2.json");

let previousState = {};

const { calculateRelevance } = require("./src/relevance");
const {
  detectChanges,
  buildPreviousState
} = require("./src/changeDetection");
const { filterElements } = require("./src/filter");

const task = "Find Mumbai flight";

console.log("\n--- P4 Decisions ---\n");

const changeResults = detectChanges(
  cycle1Input.elements,
  previousState
);

const changeMap = new Map(
  changeResults.map(result => [
    result.element.id,
    result.changed
  ])
);

for (const element of cycle1Input.elements) {
  const relevance = calculateRelevance(element, task);
  const changed = changeMap.get(element.id);

  console.log(
    element.id,
    "| relevance:", relevance.relevance_score.toFixed(2),
    "| relevant:", relevance.relevant,
    "| changed:", changed,
    "| KEEP:", relevance.relevant
  );
}

console.log("\n--- Edge Case Tests ---\n");

// 1. type: null
const nullTypeElement = cycle1Input.elements.find(
  element => element.id === "el_b02e7d"
);

console.log(
  "Null type:",
  calculateRelevance(nullTypeElement, "Search flights")
);

// 2. Repeated task word
const repeatedTask = "search search flights";

console.log(
  "Repeated task:",
  calculateRelevance(
    cycle1Input.elements.find(element => element.id === "el_d24g9b"),
    repeatedTask
  )
);

// 3. Sensitive but relevant password field
const passwordElement = cycle1Input.elements.find(
  element => element.id === "el_a91f3c"
);

const passwordResult = calculateRelevance(
  passwordElement,
  "password"
);

console.log(
  "Sensitive + relevant password:",
  passwordResult,
  "| sensitive:",
  passwordElement.sensitive,
  "| KEEP:",
  passwordResult.relevant
);

console.log("\n--- Final P4 Output ---\n");

const output = filterElements(
  cycle1Input,
  task,
  previousState
);

console.log(JSON.stringify(output, null, 2));

previousState = buildPreviousState(cycle1Input.elements);

console.log("\n--- Cycle 2 ---\n");

const cycle2ChangeResults = detectChanges(
  cycle2Input.elements,
  previousState
);

const cycle2ChangeMap = new Map(
  cycle2ChangeResults.map(result => [
    result.element.id,
    result.changed
  ])
);

for (const element of cycle2Input.elements) {
  console.log(
    element.id,
    "| changed:",
    cycle2ChangeMap.get(element.id)
  );
}

// Update state for the next cycle
previousState = buildPreviousState(cycle2Input.elements);