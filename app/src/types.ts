import z from "zod";
import { zIsolateMeta } from "./isolate/isolate-utils";

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

export const zJob = z.object({
  id: z.string(),
  commands: z.array(z.array(z.string())),
  files: z.array(
    z.object({
      name: z.string().nonempty(),
      contents: z.string(),
    }),
  ),
  hashesToLoad: z.array(z.string()).optional(),
  saveAsHash: z.boolean().optional(),
});

export const zJobResult = z.object({
  id: z.string(),
  commandResults: z.array(
    z.object({
      status: z.enum(JUDGE_STATUS_CODES),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      meta: zIsolateMeta,
      message: z.string().optional(),
    }),
  ),
  savedHash: z.string().optional(),
});
