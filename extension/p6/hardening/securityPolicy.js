/**
 * P6 Hardening Security Policy
 *
 * Centralized constants for the execution trust boundary.
 *
 * This module contains policy only.
 * It performs no execution and no logging.
 */

export const SECURITY_POLICY = Object.freeze({

  // P5 action allowlist.
  supportedActions: Object.freeze([
    "click",
    "type",
    "scroll",
    "navigate",
    "wait",
    "done"
  ]),

  // Only these URL schemes may be navigated to.
  allowedNavigationProtocols: Object.freeze([
    "http:",
    "https:"
  ]),

  // Confirmation timeout.
  confirmationTimeoutMs: 30_000,

  // Maximum useful lengths for diagnostic fields.
  maxLogStringLength: 160,

  // Maximum number of metadata keys we expose to diagnostics.
  maxLoggedMetadataKeys: 12,

  // These keys must never be logged.
  sensitiveMetadataKeys: Object.freeze([
    "value",
    "text",
    "password",
    "pass",
    "secret",
    "token",
    "authorization",
    "cookie",
    "credential",
    "credentials",
    "apiKey",
    "api_key",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token"
  ]),

  // DOM attributes that may contain sensitive information.
  sensitiveDomAttributes: Object.freeze([
    "value",
    "data-value",
    "data-secret",
    "data-token",
    "data-password"
  ])
});


export function isSupportedAction(action) {
  return (
    typeof action === "string" &&
    SECURITY_POLICY.supportedActions.includes(action)
  );
}


export function isAllowedProtocol(protocol) {
  return (
    typeof protocol === "string" &&
    SECURITY_POLICY.allowedNavigationProtocols.includes(
      protocol.toLowerCase()
    )
  );
}