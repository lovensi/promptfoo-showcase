export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 80;
export const PRIORITIES = ["low", "medium", "high"] as const;

export type Priority = (typeof PRIORITIES)[number];

export interface TaskInput {
  title: string;
  priority: Priority;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a task payload.
 * Rules:
 *  - title is required, trimmed length must be between TITLE_MIN_LENGTH and
 *    TITLE_MAX_LENGTH characters (inclusive).
 *  - priority must be one of PRIORITIES.
 */
export function validateTask(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["Task must be an object"] };
  }

  const { title, priority } = input as Record<string, unknown>;

  if (typeof title !== "string") {
    errors.push("Title is required");
  } else {
    const length = title.trim().length;
    if (length < TITLE_MIN_LENGTH) {
      errors.push(`Title must be at least ${TITLE_MIN_LENGTH} characters`);
    } else if (length >= TITLE_MAX_LENGTH) {
      errors.push(`Title must be at most ${TITLE_MAX_LENGTH} characters`);
    }
  }

  if (typeof priority !== "string" || !PRIORITIES.includes(priority as Priority)) {
    errors.push(`Priority must be one of: ${PRIORITIES.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
