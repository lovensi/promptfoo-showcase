/**
 * Truncates text to at most `max` characters, appending an ellipsis when cut.
 * Used by the task list so long titles do not break the layout.
 */
export function truncate(text: string, max: number): string {
  if (max < 1) {
    throw new RangeError("max must be at least 1");
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
