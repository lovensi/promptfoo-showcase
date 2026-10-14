/**
 * Formats a duration in milliseconds as a compact human-readable string.
 *
 * Examples:
 *   formatDuration(0)        -> "0s"
 *   formatDuration(45_000)   -> "45s"
 *   formatDuration(90_000)   -> "1m 30s"
 *   formatDuration(3_600_000)-> "1h"
 *   formatDuration(3_725_000)-> "1h 2m 5s"
 *
 * Negative or non-finite input throws a RangeError.
 * Sub-second remainders are truncated.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError("Duration must be a non-negative finite number");
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}
