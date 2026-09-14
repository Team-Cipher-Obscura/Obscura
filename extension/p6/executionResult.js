export function createExecutionResult({
  status,
  action,
  reason = null,
  target_id = null
}) {
  return {
    status,
    action,
    target_id,
    reason
  };
}