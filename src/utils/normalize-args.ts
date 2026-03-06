/**
 * Converts snake_case keys to camelCase.
 * Used by all handlers to accept both naming conventions from LLM callers.
 */
export function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    normalized[camelKey] = value;
  }
  return normalized;
}
