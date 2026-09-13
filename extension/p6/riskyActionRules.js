/**
 * P6 Risky Action Rules
 *
 * IMPORTANT:
 * This module only classifies risk.
 *
 * P3 sensitive detection remains a hard block in safetyGate.js.
 *
 * This module must never:
 * - execute actions
 * - override P3
 * - log page text
 * - treat arbitrary action names as semantic actions
 */


/**
 * Normalize text for conservative matching.
 */
function normalizeText(
  value
) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * Escape regex characters.
 */
function escapeRegex(
  value
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


/**
 * Match a phrase as a whole word/phrase.
 */
function containsPhrase(
  text,
  phrase
) {
  const normalizedText =
    normalizeText(text);

  const normalizedPhrase =
    normalizeText(phrase);

  if (
    !normalizedText ||
    !normalizedPhrase
  ) {
    return false;
  }

  const expression =
    new RegExp(
      `(?:^|\\s|[^a-z0-9])${escapeRegex(
        normalizedPhrase
      )}(?:$|\\s|[^a-z0-9])`,
      "i"
    );

  return expression.test(
    normalizedText
  );
}


/**
 * Risky financial/destructive action language.
 *
 * Keep these semantic terms conservative.
 *
 * "wire" is intentionally treated as a complete word,
 * preventing "wireless" from becoming a false positive.
 */
const RISKY_PHRASES = Object.freeze([
  "delete",
  "remove account",
  "close account",
  "terminate account",
  "transfer",
  "wire transfer",
  "send money",
  "send payment",
  "pay",
  "payment",
  "purchase",
  "buy",
  "checkout",
  "place order",
  "confirm order",
  "submit",
  "submit order",
  "submit payment",
  "withdraw",
  "withdrawal"
]);


/**
 * Attributes that may contain useful accessible semantics.
 */
const SEMANTIC_ATTRIBUTES = Object.freeze([
  "aria-label",
  "aria-description",
  "title",
  "name",
  "value",
  "alt",
  "role"
]);


function collectElementSemantics(
  element
) {
  if (
    !element ||
    typeof element !== "object"
  ) {
    return "";
  }

  const parts = [];

  // Do not read password values.
  const type =
    typeof element.type === "string"
      ? element.type.toLowerCase()
      : "";

  if (type !== "password") {
    if (
      typeof element.innerText === "string"
    ) {
      parts.push(
        element.innerText
      );
    }

    if (
      typeof element.textContent === "string"
    ) {
      parts.push(
        element.textContent
      );
    }
  }

  for (
    const attribute
    of SEMANTIC_ATTRIBUTES
  ) {

    if (
      attribute === "value" &&
      type === "password"
    ) {
      continue;
    }

    try {
      const value =
        element.getAttribute(
          attribute
        );

      if (value) {
        parts.push(value);
      }

    } catch {
      // Ignore inaccessible attributes.
    }
  }


  return parts
    .join(" ")
    .slice(0, 5000);
}


function isPasswordTarget(
  element
) {
  if (!element) {
    return false;
  }

  const type =
    typeof element.type === "string"
      ? element.type.toLowerCase()
      : "";

  return (
    type === "password"
  );
}


/**
 * Classify action risk.
 *
 * Returns:
 *
 * SAFE
 * CONFIRM
 */
export function classifyRisk(
  agentAction,
  element
) {

  if (
    !agentAction ||
    typeof agentAction !== "object"
  ) {
    return "CONFIRM";
  }


  const action =
    agentAction.action;


  if (
    action === "type" &&
    isPasswordTarget(element)
  ) {
    return "CONFIRM";
  }


  if (
    action !== "click" &&
    action !== "type"
  ) {
    /*
     * Navigation must be handled by the explicit
     * navigation policy in safetyGate.js.
     *
     * It must not silently reach this default as SAFE
     * when the navigation shape is malformed.
     */
    return "SAFE";
  }


  const semantics =
    collectElementSemantics(
      element
    );


  for (
    const phrase
    of RISKY_PHRASES
  ) {
    if (
      containsPhrase(
        semantics,
        phrase
      )
    ) {
      return "CONFIRM";
    }
  }


  return "SAFE";
}


export {
  containsPhrase,
  normalizeText,
  isPasswordTarget
};