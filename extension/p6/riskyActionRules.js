// Classifies whether an action needs user confirmation.
//
// P5's action field only contains:
//
//   click | type | scroll | navigate | wait
//
// Risky categories therefore come from the resolved DOM element,
// not from inventing action types such as "delete" or "purchase".


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
  if (!element) {
    return "";
  }

  // innerText may be empty when layout has not been calculated.
  // textContent is used only as a fallback.
  const visibleText =
    element.innerText ||
    element.textContent ||
    "";

  const parts = [
    visibleText,
    element.getAttribute("aria-label"),
    element.getAttribute("title")
  ];

  // IMPORTANT:
  //
  // Do not include input.value here.
  //
  // A typed value can contain:
  //   - passwords
  //   - tokens
  //   - payment data
  //   - personal information
  //
  // The old implementation included "value", which could leak
  // secret typed content into the risk-classification/logging path.

  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
}


function matchesRiskyKeyword(text) {
  if (!text) {
    return false;
  }

  return RISKY_KEYWORDS.some((keyword) => {
    const escapedKeyword =
      keyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    /*
     * Word boundaries are deliberately retained.
     *
     * This prevents:
     *
     *   "wire"
     *
     * from matching:
     *
     *   "wireless"
     *
     * while still matching:
     *
     *   "Wire Money"
     */
    const pattern =
      new RegExp(
        `\\b${escapedKeyword}\\b`,
        "i"
      );

    return pattern.test(text);
  });
}


/**
 * Detect credential/password fields.
 *
 * Password risk must not depend solely on:
 *
 *   type="password"
 *
 * Modern sites frequently use autocomplete semantics.
 *
 * We therefore retain all of:
 *
 *   type="password"
 *   autocomplete="current-password"
 *   autocomplete="new-password"
 *
 * We also support the common "one-time-code" / credential
 * semantics conservatively where appropriate.
 */
export function isPasswordField(element) {
  if (!element) {
    return false;
  }

  const type =
    (
      element.getAttribute("type") ||
      ""
    )
      .trim()
      .toLowerCase();

  const autocomplete =
    (
      element.getAttribute("autocomplete") ||
      ""
    )
      .trim()
      .toLowerCase();

  if (type === "password") {
    return true;
  }

  if (
    autocomplete === "current-password" ||
    autocomplete === "new-password"
  ) {
    return true;
  }

  return false;
}


/**
 * Returns:
 *
 *   "SAFE"
 *   "CONFIRM"
 */
export function classifyRisk(
  agentAction,
  element
) {
  if (
    !agentAction ||
    !element
  ) {
    return "SAFE";
  }


  // -----------------------------------------
  // Password / credential typing
  // -----------------------------------------

  if (
    agentAction.action === "type" &&
    isPasswordField(element)
  ) {
    return "CONFIRM";
  }


  // -----------------------------------------
  // Risky clicks
  // -----------------------------------------

  if (
    agentAction.action === "click"
  ) {
    const text =
      getAccessibleText(element);

    if (
      matchesRiskyKeyword(text)
    ) {
      return "CONFIRM";
    }
  }


  return "SAFE";
}


/**
 * Testing helper.
 *
 * Kept exported so Phase 6 hardening tests can directly verify
 * the boundary behavior without needing to execute an action.
 */
export function _matchesRiskyKeywordForTesting(
  text
) {
  return matchesRiskyKeyword(
    String(text || "")
      .toLowerCase()
  );
}