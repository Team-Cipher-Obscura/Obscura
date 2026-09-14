// Stores the latest sensitive-element information received from P3.
//
// P6 uses this as a hard safety veto.
// This module intentionally does not use chrome.* APIs so that
// it can be tested independently.

let sensitiveIds = new Set();
let typesById = {};


/**
 * Update the registry with P3's latest payload.
 */
export function update(payload) {

  if (
    !payload ||
    !Array.isArray(payload.sensitive_element_ids)
  ) {
    return;
  }

  sensitiveIds =
    new Set(payload.sensitive_element_ids);

  typesById =
    payload.types || {};
}


/**
 * Check whether a target has been marked sensitive by P3.
 */
export function isSensitive(targetId) {
  return sensitiveIds.has(targetId);
}


/**
 * Get P3's sensitive type for a target.
 */
export function getSensitiveType(targetId) {
  return typesById[targetId] || null;
}


/**
 * Used only by tests.
 */
export function _resetForTesting() {
  sensitiveIds = new Set();
  typesById = {};
}