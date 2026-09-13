// Classifies whether an action needs user confirmation.
//
// P5's action field only contains:
// click | type | scroll | navigate | wait
//
// Therefore risky categories are detected from the resolved
// DOM element's text and attributes.

const RISKY_KEYWORDS = [
  "delete",
  "remove",
  "trash",
  "discard",
  "erase",

  "buy",
  "purchase",
  "checkout",
  "place order",
  "confirm order",

  "pay",
  "payment",
  "pay now",
  "charge",

  "transfer",
  "send money",
  "wire",

  "submit",

  "send",

  "change password",
  "update password",
  "reset password",
  "set password"
];


function getAccessibleText(element) {

  const parts = [
    element.innerText,
    element.getAttribute("aria-label"),
    element.getAttribute("value"),
    element.getAttribute("title")
  ];

  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
}


function matchesRiskyKeyword(text) {

  return RISKY_KEYWORDS.some(
    (keyword) => text.includes(keyword)
  );
}


function isPasswordField(element) {

  const type =
    (element.getAttribute("type") || "")
      .toLowerCase();

  const autocomplete =
    (element.getAttribute("autocomplete") || "")
      .toLowerCase();

  return (
    type === "password" ||
    autocomplete === "new-password" ||
    autocomplete === "current-password"
  );
}


/**
 * Returns:
 *   "SAFE"
 *   "CONFIRM"
 */
export function classifyRisk(agentAction, element) {

  if (!element) {
    return "SAFE";
  }

  // Typing into a password field is risky.
  if (
    agentAction.action === "type" &&
    isPasswordField(element)
  ) {
    return "CONFIRM";
  }

  // Clicks can represent risky operations.
  if (agentAction.action === "click") {

    const text =
      getAccessibleText(element);

    if (matchesRiskyKeyword(text)) {
      return "CONFIRM";
    }
  }

  return "SAFE";
}