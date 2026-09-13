// domAttribute.js
// Runs on EVERY element, EVERY cycle, no relevance gating.
// Flags elements based on tag/type/autocomplete attributes alone —
// no text inspection here (that's regex.js's job).

const SENSITIVE_TYPES = new Set(["password", "email", "tel"]);

const SENSITIVE_AUTOCOMPLETE = new Set([
  "cc-number",
  "cc-exp",
  "cc-exp-month", // real payment forms often split expiry into two fields —
  "cc-exp-year",  // "cc-exp" alone misses these
  "cc-csc",       // CVV/CVC field
  "cc-name",
  "current-password",
  "new-password",
  "one-time-code",
  "email",
  "tel",
]);

/**
 * @param {object} element - single element from P2's elements[] array
 * @returns {{ sensitive: boolean, sensitive_type: string|null }}
 */
export function checkDomAttribute(element) {
  if (!element) return { sensitive: false, sensitive_type: null };

  const type = (element.type || "").toLowerCase();
  const autocomplete = (element.autocomplete || "").toLowerCase();

  if (type === "password") {
    return { sensitive: true, sensitive_type: "password_field" };
  }
  if (type === "email") {
    return { sensitive: true, sensitive_type: "email_field" };
  }
  if (type === "tel") {
    return { sensitive: true, sensitive_type: "phone_field" };
  }
  if (SENSITIVE_AUTOCOMPLETE.has(autocomplete)) {
    return { sensitive: true, sensitive_type: `autocomplete_${autocomplete}` };
  }

  return { sensitive: false, sensitive_type: null };
}

/**
 * Runs checkDomAttribute across the full elements[] array.
 * Always runs on 100% of elements — no gating.
 */
export function checkAllDomAttributes(elements) {
  return elements.map((el) => ({
    id: el.id,
    ...checkDomAttribute(el),
  }));
}