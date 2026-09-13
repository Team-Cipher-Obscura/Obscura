/**
 * P6 Phase 5 Benchmark Cases
 *
 * Ground-truth cases for target-resolution evaluation.
 *
 * Each case defines:
 * - target_id
 * - expected resolver outcome
 * - category
 *
 * The benchmark runner compares the actual resolver result
 * against this ground truth.
 *
 * IMPORTANT:
 * This file contains synthetic evaluation data only.
 * It does not contain real PII.
 */

export const targetResolutionCases = [
  {
    id: "normal-visible",
    category: "normal",
    target_id: "bench_normal",
    expected: {
      success: true,
      status: "TARGET_RESOLVED"
    }
  },

  {
    id: "hidden-element",
    category: "hidden",
    target_id: "bench_hidden",
    expected: {
      success: false,
      status: "TARGET_NOT_VISIBLE"
    }
  },

  {
    id: "disabled-element",
    category: "disabled",
    target_id: "bench_disabled",
    expected: {
      success: false,
      status: "TARGET_DISABLED"
    }
  },

  {
    id: "aria-disabled-element",
    category: "disabled",
    target_id: "bench_aria_disabled",
    expected: {
      success: false,
      status: "TARGET_DISABLED"
    }
  },

  {
    id: "covered-element",
    category: "covered",
    target_id: "bench_covered",
    expected: {
      success: false,
      status: "TARGET_COVERED"
    }
  },

  {
    id: "stale-target",
    category: "stale",
    target_id: "bench_stale",
    expected: {
      success: false,
      status: "TARGET_NOT_FOUND"
    }
  },

  {
    id: "missing-target",
    category: "missing",
    target_id: "bench_does_not_exist",
    expected: {
      success: false,
      status: "TARGET_NOT_FOUND"
    }
  }
];


/**
 * Safety-gate benchmark cases.
 *
 * These cases intentionally avoid execution.
 * They evaluate the P6 decision boundary only.
 */
export const safetyEvaluationCases = [
  {
    id: "safe-click",
    category: "safe",
    action: {
      action: "click",
      target_id: "bench_safe_button",
      confidence: 0.99,
      metadata: {}
    },
    expectedDecision: "EXECUTE"
  },

  {
    id: "risky-submit",
    category: "confirmation",
    action: {
      action: "click",
      target_id: "bench_submit_button",
      confidence: 0.99,
      metadata: {}
    },
    expectedDecision: "CONFIRM"
  },

  {
    id: "password-typing",
    category: "confirmation",
    action: {
      action: "type",
      target_id: "bench_password",
      confidence: 0.99,
      metadata: {
        text: "[BENCHMARK_VALUE]"
      }
    },
    expectedDecision: "CONFIRM"
  },

  {
    id: "safe-scroll",
    category: "safe",
    action: {
      action: "scroll",
      target_id: null,
      confidence: 0.99,
      metadata: {}
    },
    expectedDecision: "EXECUTE"
  },

  {
    id: "safe-wait",
    category: "safe",
    action: {
      action: "wait",
      target_id: null,
      confidence: 0.99,
      metadata: {}
    },
    expectedDecision: "EXECUTE"
  },

  {
    id: "navigation-requires-confirmation",
    category: "confirmation",
    action: {
      action: "navigate",
      target_id: null,
      confidence: 0.99,
      metadata: {
        url: "https://example.com"
      }
    },
    expectedDecision: "CONFIRM"
  },

  {
    id: "unsafe-navigation",
    category: "blocked",
    action: {
      action: "navigate",
      target_id: null,
      confidence: 0.99,
      metadata: {
        url: "javascript:alert(1)"
      }
    },
    expectedDecision: "BLOCK"
  },

  {
    id: "navigation-with-target",
    category: "blocked",
    action: {
      action: "navigate",
      target_id: "bench_safe_button",
      confidence: 0.99,
      metadata: {
        url: "https://example.com"
      }
    },
    expectedDecision: "BLOCK"
  }
];


/**
 * Optional example P3 classification dataset.
 *
 * This is deliberately empty.
 *
 * Phase 5 must NOT invent P3 precision/recall results.
 * Populate this only with real labeled P3 evaluation data.
 */
export const p3ClassificationCases = [];


/**
 * Optional redaction evaluation dataset.
 *
 * This is deliberately empty.
 *
 * Populate this with ground-truth examples supplied by P3/P4.
 */
export const redactionCases = [];