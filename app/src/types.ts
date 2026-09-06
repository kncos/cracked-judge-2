export const JUDGE_STATUS_CODES = [
  "internal_error",
  "compiler_error",
  "runtime_error",
  "memory_limit_exceeded",
  "time_limit_exceeded",
  "wrong_answer",
  "accepted",
  "output_limit_exceeded",
] as const;

export type JudgeStatus = (typeof JUDGE_STATUS_CODES)[number];
