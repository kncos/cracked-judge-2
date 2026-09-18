import z from "zod";

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

export const zIsolateRunOpts = z.object({
  cmd: z.array(z.string().nonempty()).nonempty(),
  box_id: z.int(),
  time: z.number().nonnegative().optional(),
  cg_mem: z.int().nonnegative().optional(),
  wall_time: z.number().nonnegative().optional(),
  extra_time: z.number().nonnegative().optional(),
  stack: z.int().nonnegative().optional(),
  open_files: z.int().nonnegative().optional(),
  fsize: z.int().nonnegative().optional(),
  quota: z
    .object({
      blocks: z.int().nonnegative(),
      inodes: z.int().nonnegative(),
    })
    .optional(),
  processes: z.int().or(z.literal(true)).optional(),
  add_readonly_dirs: z.array(z.string().nonempty()).optional(),
});

export const zIsolateMeta = z.object({
  cg_mem: z.coerce.number(),
  // the key is present with value `1` if its true. Normalized to true/false here
  cg_oom_killed: z.coerce
    .number()
    .optional()
    .default(0)
    .transform((v) => v === 1),
  csw_forced: z.coerce.number(),
  csw_voluntary: z.coerce.number(),
  exitcode: z.coerce.number().optional(),
  exitsig: z.coerce.number().optional(),
  // normalized to true/false
  killed: z.coerce
    .number()
    .optional()
    .default(0)
    .transform((v) => v === 1),
  max_rss: z.coerce.number(),
  message: z.string().optional().default("N/A"),
  status: z.enum(["RE", "SG", "TO", "XX"]).optional(),
  time: z.coerce.number(),
  time_wall: z.coerce.number(),
});

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

export const zRedisConfig = z.object({
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default("password"),
  REDIS_USERNAME: z.string().optional(),
  REDIS_TLS: z.literal(true).optional(),
  REDIS_DB: z.number().int().min(0).max(15).default(0),
});
