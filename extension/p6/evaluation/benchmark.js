/**
 * P6 Phase 5 Evaluation / Benchmarking
 *
 * IMPORTANT:
 *
 * This module is intentionally separate from the live action pipeline.
 *
 * It must never:
 * - modify actionPipeline.js
 * - modify executor.js
 * - block execution
 * - add synchronous work to live actions
 * - log sensitive page content
 *
 * The benchmark measures existing P6 components from an isolated
 * evaluation environment.
 */

import { resolveTarget } from "../targetResolver.js";
import { evaluateAction } from "../safetyGate.js";

import {
  targetResolutionCases,
  safetyEvaluationCases,
  p3ClassificationCases,
  redactionCases
} from "./benchmarkCases.js";


function now() {
  return performance.now();
}


function round(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}


/**
 * Compare an actual target-resolution result with ground truth.
 */
function matchesResolutionExpectation(
  actual,
  expected
) {
  return (
    actual.success === expected.success &&
    actual.status === expected.status
  );
}


/**
 * Run target-resolution benchmark.
 */
export function runTargetResolutionBenchmark() {
  const startedAt = now();

  const results = [];
  let correct = 0;

  for (const testCase of targetResolutionCases) {
    const caseStart = now();

    const actual =
      resolveTarget(testCase.target_id);

    const duration =
      now() - caseStart;

    const passed =
      matchesResolutionExpectation(
        actual,
        testCase.expected
      );

    if (passed) {
      correct += 1;
    }

    results.push({
      id: testCase.id,
      category: testCase.category,
      expected: testCase.expected,
      actual: {
        success: actual.success,
        status: actual.status
      },
      passed,
      latency_ms: round(duration)
    });
  }

  const total =
    targetResolutionCases.length;

  return {
    metric: "target_resolution_accuracy",
    correct,
    total,
    accuracy: total > 0
      ? round(correct / total, 4)
      : null,
    duration_ms: round(now() - startedAt),
    cases: results
  };
}


/**
 * Run safety-gate benchmark.
 *
 * This evaluates decisions only.
 * It does NOT execute browser actions.
 */
export function runSafetyGateBenchmark() {
  const startedAt = now();

  const results = [];
  let correct = 0;

  for (const testCase of safetyEvaluationCases) {
    const caseStart = now();

    const actual =
      evaluateAction(testCase.action);

    const duration =
      now() - caseStart;

    const passed =
      actual.decision ===
      testCase.expectedDecision;

    if (passed) {
      correct += 1;
    }

    results.push({
      id: testCase.id,
      category: testCase.category,
      expected_decision:
        testCase.expectedDecision,
      actual_decision:
        actual.decision,
      status:
        actual.status,
      passed,
      latency_ms:
        round(duration)
    });
  }

  const total =
    safetyEvaluationCases.length;

  return {
    metric: "safety_gate_decision_accuracy",
    correct,
    total,
    accuracy: total > 0
      ? round(correct / total, 4)
      : null,
    duration_ms:
      round(now() - startedAt),
    cases: results
  };
}


/**
 * Calculate precision and recall from labeled binary
 * classification examples.
 *
 * Expected case format:
 *
 * {
 *   expected: true/false,
 *   predicted: true/false
 * }
 */
export function calculatePrecisionRecall(
  cases
) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (const item of cases) {
    const expected =
      Boolean(item.expected);

    const predicted =
      Boolean(item.predicted);

    if (expected && predicted) {
      truePositive += 1;
    } else if (!expected && predicted) {
      falsePositive += 1;
    } else if (expected && !predicted) {
      falseNegative += 1;
    } else {
      trueNegative += 1;
    }
  }

  const precisionDenominator =
    truePositive + falsePositive;

  const recallDenominator =
    truePositive + falseNegative;

  return {
    available: cases.length > 0,

    sample_count:
      cases.length,

    true_positive:
      truePositive,

    false_positive:
      falsePositive,

    false_negative:
      falseNegative,

    true_negative:
      trueNegative,

    precision:
      precisionDenominator > 0
        ? round(
            truePositive /
            precisionDenominator,
            4
          )
        : null,

    recall:
      recallDenominator > 0
        ? round(
            truePositive /
            recallDenominator,
            4
          )
        : null
  };
}


/**
 * P3 precision / recall.
 *
 * No result is fabricated when labeled data is absent.
 */
export function runP3Benchmark(
  cases = p3ClassificationCases
) {
  if (!cases.length) {
    return {
      metric: "p3_pii_precision_recall",
      available: false,
      reason:
        "No labeled P3 evaluation dataset supplied.",
      precision: null,
      recall: null,
      sample_count: 0
    };
  }

  return {
    metric: "p3_pii_precision_recall",
    ...calculatePrecisionRecall(cases)
  };
}


/**
 * Calculate redaction metrics from labeled cases.
 *
 * Expected fields:
 *
 * {
 *   expectedRedacted: boolean,
 *   actualRedacted: boolean
 * }
 */
export function calculateRedactionMetrics(
  cases
) {
  let correct = 0;
  let underRedaction = 0;
  let overRedaction = 0;

  for (const item of cases) {
    const expected =
      Boolean(item.expectedRedacted);

    const actual =
      Boolean(item.actualRedacted);

    if (expected === actual) {
      correct += 1;
      continue;
    }

    if (expected && !actual) {
      underRedaction += 1;
    } else if (!expected && actual) {
      overRedaction += 1;
    }
  }

  const total = cases.length;

  return {
    available: total > 0,
    sample_count: total,

    correct_redaction:
      correct,

    under_redaction:
      underRedaction,

    over_redaction:
      overRedaction,

    accuracy:
      total > 0
        ? round(correct / total, 4)
        : null
  };
}


/**
 * Redaction benchmark.
 *
 * Returns unavailable instead of inventing a result.
 */
export function runRedactionBenchmark(
  cases = redactionCases
) {
  if (!cases.length) {
    return {
      metric: "redaction_accuracy",
      available: false,
      reason:
        "No labeled P3/P4 redaction dataset supplied.",
      sample_count: 0,
      correct_redaction: 0,
      under_redaction: 0,
      over_redaction: 0,
      accuracy: null
    };
  }

  return {
    metric: "redaction_accuracy",
    ...calculateRedactionMetrics(cases)
  };
}


/**
 * Browser resource information.
 *
 * Browser APIs do not expose reliable CPU/GPU utilization
 * to normal extension JavaScript, so unavailable fields
 * remain null.
 */
export function collectResourceSnapshot() {
  const snapshot = {
    timestamp:
      new Date().toISOString(),

    memory: {
      available: false,
      used_js_heap_bytes: null,
      total_js_heap_bytes: null,
      js_heap_limit_bytes: null
    },

    cpu: {
      available: false,
      utilization_percent: null
    },

    gpu: {
      available: false,
      utilization_percent: null
    }
  };

  /**
   * Chrome exposes performance.memory in some environments.
   *
   * It is non-standard, so check before using it.
   */
  if (
    performance.memory &&
    typeof performance.memory.usedJSHeapSize ===
      "number"
  ) {
    snapshot.memory.available = true;

    snapshot.memory.used_js_heap_bytes =
      performance.memory.usedJSHeapSize;

    snapshot.memory.total_js_heap_bytes =
      performance.memory.totalJSHeapSize;

    snapshot.memory.js_heap_limit_bytes =
      performance.memory.jsHeapSizeLimit;
  }

  /**
   * The WebGPU API indicates API availability,
   * not GPU utilization.
   */
  snapshot.gpu.available =
    typeof navigator !== "undefined" &&
    "gpu" in navigator;

  return snapshot;
}


/**
 * Measure repeated target-resolution workload.
 *
 * This provides a lightweight repeated-action measurement
 * without invoking real browser actions.
 */
export function runRepeatedResolutionBenchmark(
  iterations = 100
) {
  const safeIterations =
    Math.max(
      1,
      Math.floor(iterations)
    );

  const targetId =
    targetResolutionCases.find(
      (item) =>
        item.expected.success === true
    )?.target_id;

  if (!targetId) {
    return {
      available: false,
      reason:
        "No successful target-resolution case exists."
    };
  }

  const before =
    collectResourceSnapshot();

  const startedAt = now();

  for (
    let index = 0;
    index < safeIterations;
    index += 1
  ) {
    resolveTarget(targetId);
  }

  const duration =
    now() - startedAt;

  const after =
    collectResourceSnapshot();

  return {
    available: true,

    iterations:
      safeIterations,

    total_duration_ms:
      round(duration),

    average_resolution_ms:
      round(
        duration /
        safeIterations,
        4
      ),

    resource_before:
      before,

    resource_after:
      after
  };
}


/**
 * Measure safety-evaluation latency.
 *
 * This is intentionally evaluation-only and does not execute
 * any action.
 */
export function runLatencyBenchmark() {
  const results = [];

  for (const testCase of safetyEvaluationCases) {
    const receivedAt =
      now();

    const safetyStartedAt =
      now();

    const safetyResult =
      evaluateAction(testCase.action);

    const safetyCompletedAt =
      now();

    results.push({
      id: testCase.id,

      action:
        testCase.action.action,

      received_to_safety_ms:
        round(
          safetyStartedAt -
          receivedAt
        ),

      safety_evaluation_ms:
        round(
          safetyCompletedAt -
          safetyStartedAt
        ),

      evaluation_total_ms:
        round(
          safetyCompletedAt -
          receivedAt
        ),

      decision:
        safetyResult.decision,

      status:
        safetyResult.status
    });
  }

  const durations =
    results
      .map(
        (item) =>
          item.safety_evaluation_ms
      )
      .filter(
        (value) =>
          Number.isFinite(value)
      );

  const average =
    durations.length
      ? durations.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / durations.length
      : null;

  return {
    metric:
      "p6_safety_evaluation_latency",

    case_count:
      results.length,

    average_safety_evaluation_ms:
      round(average, 4),

    cases:
      results
  };
}


/**
 * Run the complete Phase 5 benchmark suite.
 */
export function runPhase5Benchmark({
  repeatedIterations = 100
} = {}) {
  const benchmarkStartedAt =
    new Date().toISOString();

  const startedAt =
    now();

  const resourcesBefore =
    collectResourceSnapshot();

  const targetResolution =
    runTargetResolutionBenchmark();

  const safetyGate =
    runSafetyGateBenchmark();

  const p3 =
    runP3Benchmark();

  const redaction =
    runRedactionBenchmark();

  const repeated =
    runRepeatedResolutionBenchmark(
      repeatedIterations
    );

  const latency =
    runLatencyBenchmark();

  const resourcesAfter =
    collectResourceSnapshot();

  return {
    benchmark: {
      name:
        "Obscura P6 Phase 5 Evaluation",

      version:
        "1.0.0",

      started_at:
        benchmarkStartedAt,

      completed_at:
        new Date().toISOString(),

      total_duration_ms:
        round(now() - startedAt)
    },

    target_resolution:
      targetResolution,

    safety_gate:
      safetyGate,

    pii:
      p3,

    redaction,

    repeated_workload:
      repeated,

    latency,

    resources: {
      before:
        resourcesBefore,

      after:
        resourcesAfter
    }
  };
}


/**
 * Download benchmark output as JSON.
 *
 * This is a reporting helper only.
 * It is never called from the live action pipeline.
 */
export function downloadBenchmarkJson(
  benchmarkResult,
  filename =
    "p6-phase5-benchmark.json"
) {
  const json =
    JSON.stringify(
      benchmarkResult,
      null,
      2
    );

  const blob =
    new Blob(
      [json],
      {
        type:
          "application/json"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}