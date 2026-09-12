// regex.js
// Runs on EVERY element's `text` field, every cycle, no relevance gating.
// Complements domAttribute.js by catching PII in *content*, not just field type
// (e.g. an email typed into a generic <div>, or a card number pasted into a
// textarea that has no type="cc-number").

const PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  otp: /\b\d{4,8}\b(?=.{0,20}(code|otp|verification)|)/i,
  // Loose credit-card-like: 13-19 digits, optionally grouped by spaces/dashes
  creditCard: /\b(?:\d[ -]*?){13,19}\b/,
  // Card expiry: MM/YY or MM/YYYY (e.g. "04/27", "04/2027")
  cardExpiry: /\b(0[1-9]|1[0-2])\s?\/\s?(\d{2}|\d{4})\b/,
  // CVV/CVC: 3-4 digit code, only counted as sensitive near a contextual
  // keyword — a bare 3-4 digit number is too common to flag on its own
  // (unlike a card number, which is long enough to be distinctive by length).
  cvv: /\b\d{3,4}\b(?=.{0,15}(cvv|cvc|security code|card verification))|(?:cvv|cvc|security code|card verification).{0,15}\b(\d{3,4})\b/i,
};

/**
 * @param {string} text
 * @returns {{ sensitive: boolean, sensitive_type: string|null }}
 */
export function checkRegex(text) {
  if (!text || typeof text !== "string") {
    return { sensitive: false, sensitive_type: null };
  }

  if (PATTERNS.email.test(text)) {
    return { sensitive: true, sensitive_type: "email_text" };
  }
  if (PATTERNS.creditCard.test(text.replace(/\s/g, ""))) {
    return { sensitive: true, sensitive_type: "credit_card_text" };
  }
  if (PATTERNS.cardExpiry.test(text)) {
    return { sensitive: true, sensitive_type: "card_expiry_text" };
  }
  if (PATTERNS.cvv.test(text)) {
    return { sensitive: true, sensitive_type: "cvv_text" };
  }
  if (PATTERNS.phone.test(text)) {
    return { sensitive: true, sensitive_type: "phone_text" };
  }
  if (PATTERNS.otp.test(text)) {
    return { sensitive: true, sensitive_type: "otp_text" };
  }

  return { sensitive: false, sensitive_type: null };
}

/**
 * Runs checkRegex across the full elements[] array's text fields.
 * Always runs on 100% of elements — no gating.
 */
export function checkAllRegex(elements) {
  return elements.map((el) => ({
    id: el.id,
    ...checkRegex(el.text),
  }));
}