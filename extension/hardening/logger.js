/**
 * P6 Structured Security Logger
 *
 * Privacy rule:
 *
 * The logger must NEVER receive or emit:
 * - password values
 * - typed text
 * - raw PII
 * - page text
 * - DOM innerHTML
 * - cookies
 * - tokens
 * - authorization headers
 *
 * The logger records security-relevant metadata only.
 */

import {
  SECURITY_POLICY
} from "./securityPolicy.js";


const LEVELS = Object.freeze([
  "debug",
  "info",
  "warn",
  "error"
]);


let enabled = true;


export function setLoggingEnabled(value) {
  enabled = Boolean(value);
}


export function isLoggingEnabled() {
  return enabled;
}


function truncate(value) {
  if (typeof value !== "string") {
    return value;
  }

  const limit =
    SECURITY_POLICY.maxLogStringLength;

  if (value.length <= limit) {
    return value;
  }

  return (
    value.slice(0, limit) +
    "…"
  );
}


function sanitizeString(value) {
  if (typeof value !== "string") {
    return value;
  }

  return truncate(
    value
      // Prevent control characters from becoming
      // misleading terminal/log output.
      .replace(/[\u0000-\u001F\u007F]/g, "")
  );
}


function isSensitiveKey(key) {
  if (typeof key !== "string") {
    return false;
  }

  const normalized =
    key.toLowerCase();

  return SECURITY_POLICY
    .sensitiveMetadataKeys
    .some(
      (sensitiveKey) =>
        normalized ===
        sensitiveKey.toLowerCase()
    );
}


function sanitizeValue(
  value,
  key = ""
) {
  if (isSensitiveKey(key)) {
    return "[REDACTED]";
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    return sanitizeString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map(
        (item) =>
          sanitizeValue(item)
      );
  }

  if (
    typeof value === "object"
  ) {
    return sanitizeObject(value);
  }

  return "[UNLOGGABLE]";
}


function sanitizeObject(
  object
) {
  if (
    object === null ||
    typeof object !== "object"
  ) {
    return sanitizeValue(object);
  }

  const output = {};

  const keys =
    Object.keys(object)
      .slice(
        0,
        SECURITY_POLICY
          .maxLoggedMetadataKeys
      );

  for (const key of keys) {

    if (isSensitiveKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }

    output[key] =
      sanitizeValue(
        object[key],
        key
      );
  }

  return output;
}


function sanitizeAction(action) {
  if (
    !action ||
    typeof action !== "object"
  ) {
    return null;
  }

  return {
    action:
      typeof action.action === "string"
        ? action.action
        : null,

    target_id:
      typeof action.target_id === "string"
        ? action.target_id
        : null,

    confidence:
      typeof action.confidence === "number"
        ? action.confidence
        : null,

    metadata:
      sanitizeObject(
        action.metadata || {}
      )
  };
}


function buildEntry(
  level,
  event,
  data
) {
  return {
    timestamp:
      new Date().toISOString(),

    component:
      "P6",

    level,

    event,

    data:
      sanitizeObject(data || {})
  };
}


function emit(
  level,
  event,
  data
) {
  if (!enabled) {
    return;
  }

  if (!LEVELS.includes(level)) {
    level = "info";
  }

  const entry =
    buildEntry(
      level,
      event,
      data
    );

  switch (level) {
    case "debug":
      console.debug(
        "[P6]",
        entry
      );
      break;

    case "warn":
      console.warn(
        "[P6]",
        entry
      );
      break;

    case "error":
      console.error(
        "[P6]",
        entry
      );
      break;

    default:
      console.info(
        "[P6]",
        entry
      );
  }
}


export const logger = Object.freeze({

  debug(event, data = {}) {
    emit(
      "debug",
      event,
      data
    );
  },

  info(event, data = {}) {
    emit(
      "info",
      event,
      data
    );
  },

  warn(event, data = {}) {
    emit(
      "warn",
      event,
      data
    );
  },

  error(event, data = {}) {
    emit(
      "error",
      event,
      data
    );
  },

  action(event, action, data = {}) {
    emit(
      "info",
      event,
      {
        action:
          sanitizeAction(action),

        ...data
      }
    );
  },

  sanitizeAction
});


export function sanitizeForLog(
  value
) {
  return sanitizeValue(value);
}