import z from "zod";
import { zIsolateMeta, zIsolateRunOpts } from "./isolate/isolate-utils";

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
  commands: z.array(zIsolateRunOpts.omit({ box_id: true })),
  files: z.array(
    z.object({
      name: z.string().nonempty(),
      contents: z.string(),
    }),
  ),
  saveAsHash: z.boolean().optional(),
});

export const zJobCommandResult = z.object({
  status: z.enum(JUDGE_STATUS_CODES),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  meta: zIsolateMeta,
  message: z.string().optional(),
});

export const zJobResult = z.object({
  id: z.string(),
  commandResults: z.array(zJobCommandResult),
  savedHash: z.string().optional(),
});

export const isStrArray = (input: any): input is Array<string> =>
  Array.isArray(input) && input.every((val) => typeof val === "string");
