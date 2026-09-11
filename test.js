const p3Input = require("./mock/p3-input.json");
const previousState = require("./mock/previous-state.json");

const { filterElements } = require("./src/filter");

const task = "Find Mumbai flight";

const output = filterElements(
  p3Input,
  task,
  previousState
);

console.log(JSON.stringify(output, null, 2));