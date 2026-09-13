import { createExecutionResult } from "./executionResult.js";

export function executeAction(agentAction, element) {
  if (!agentAction || typeof agentAction !== "object") {
    return createExecutionResult({
      status: "FAILED",
      action: null,
      reason: "Invalid action object."
    });
  }

  const {
    action,
    target_id,
    metadata = {}
  } = agentAction;

  try {

    // -----------------------------------------
    // 1. CLICK
    // -----------------------------------------

    if (action === "click") {

      if (!element || !element.isConnected) {
        return createExecutionResult({
          status: "FAILED",
          action,
          target_id,
          reason: "Target element is stale or detached."
        });
      }

      element.click();

      return createExecutionResult({
        status: "EXECUTED",
        action,
        target_id
      });
    }


    // -----------------------------------------
    // 2. TYPE
    // -----------------------------------------

    if (action === "type") {

      if (!element || !element.isConnected) {
        return createExecutionResult({
          status: "FAILED",
          action,
          target_id,
          reason: "Target element is stale or detached."
        });
      }

      const tagName = element.tagName.toLowerCase();

        const type =
        (element.getAttribute("type") || "text").toLowerCase();

        const canType =
        tagName === "textarea" ||
        (
            tagName === "input" &&
            !["button", "submit", "reset", "checkbox", "radio", "file"].includes(type)
        );

        if (!canType) {
        return createExecutionResult({
            status: "FAILED",
            action,
            target_id,
            reason: "Target element does not support typing."
        });
        }

      element.focus();

      element.value = metadata.value ?? "";

      element.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );

      element.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );

      return createExecutionResult({
        status: "EXECUTED",
        action,
        target_id
      });
    }


    // -----------------------------------------
    // 3. SCROLL
    // -----------------------------------------

    if (action === "scroll") {

      const amount = Number(metadata.amount) || 0;

      const direction =
        metadata.direction === "up"
          ? -1
          : 1;

      window.scrollBy({
        top: direction * amount,
        behavior: "smooth"
      });

      return createExecutionResult({
        status: "EXECUTED",
        action,
        target_id
      });
    }


    // -----------------------------------------
    // 4. NAVIGATE
    // -----------------------------------------

    if (action === "navigate") {

      const url = metadata.url;

      if (!url) {
        return createExecutionResult({
          status: "FAILED",
          action,
          target_id,
          reason: "Navigation URL is missing."
        });
      }

      window.location.href = url;

      return createExecutionResult({
        status: "EXECUTED",
        action,
        target_id
      });
    }


    // -----------------------------------------
    // 5. WAIT
    // -----------------------------------------

    if (action === "wait") {

      return createExecutionResult({
        status: "EXECUTED",
        action,
        target_id,
        reason: metadata.reason || null
      });
    }


    // -----------------------------------------
    // UNKNOWN ACTION
    // -----------------------------------------

    return createExecutionResult({
      status: "FAILED",
      action,
      target_id,
      reason: `Unsupported action: ${action}`
    });

  } catch (error) {

    return createExecutionResult({
      status: "FAILED",
      action,
      target_id,
      reason: error.message || "Execution failed."
    });
  }
}