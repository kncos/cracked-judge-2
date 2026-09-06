import z from "zod";
import { CrackedError } from "../cracked-error";
import type { JudgeStatus } from "../types";
import { signalCodeMapping } from "../utils";

export const zIsolateRunOpts = z.object({
  // only required param
  // cmd: z.array(z.string().nonempty()).nonempty(),
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
  box_id: z.int(),
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

export const parseMeta = (fileText: string): z.infer<typeof zIsolateMeta> => {
  const entries = fileText
    .split("\n")
    .map((line) => line.split(":"))
    .filter((pair) => pair.length >= 2)
    // `:` substituted back in if a value inadvertantly had a `:`,
    // but it never should have this because isolate generates the values
    // and `:` is its delimiter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .map(([k, ...v]) => [k!.replaceAll("-", "_"), v.join(":")]);

  const metaRes = zIsolateMeta.safeParse(Object.fromEntries(entries));
  if (metaRes.error) {
    throw new CrackedError("PARSE_ERROR", {
      message: `Failed to parse isolate meta:\n${z.prettifyError(metaRes.error)}`,
      cause: metaRes.error,
    });
  }

  return metaRes.data;
};

export const interpretMeta = (
  runtimeMeta: z.infer<typeof zIsolateMeta>,
): {
  status: JudgeStatus;
  message: string;
} => {
  // some internal error to isolate occurred. Never want to see this
  if (runtimeMeta.status === "XX") {
    return { status: "internal_error", message: "Something went wrong" };
  }

  if (runtimeMeta.status === "TO") {
    return { status: "time_limit_exceeded", message: "Time Limit Exceeded" };
  }

  // when this happens, we also get meta.status === "SG" w/ SIGSEGV, but
  // seeing cg_oom_killed alone is all we need to classify MLE
  if (runtimeMeta.cg_oom_killed) {
    return {
      status: "memory_limit_exceeded",
      message: "Memory Limit Exceeded",
    };
  }

  // 69 is reserved (arbitrarily) by my judge driver code as the "wrong answer"
  // exit code. This is probably "RE" status but we only need to see 69 to classify WA
  if (runtimeMeta?.exitcode === 69) {
    return { status: "wrong_answer", message: "Wrong Answer" };
  }

  // some other non-zero exit code received. Probably means user program threw
  // and the judge returned non-zero but non-69 as a result to indicate a bad submission
  if (runtimeMeta.status === "RE") {
    return { status: "runtime_error", message: "Runtime Error" };
  }

  // process terminated with a signal
  if (runtimeMeta.status === "SG") {
    const sig = signalCodeMapping[runtimeMeta.exitsig || -1];
    if (sig === "SIGXFSZ") {
      return {
        status: "output_limit_exceeded",
        message: "output limit exceeded",
      };
    }

    // default message informs us of the signal
    return { status: "runtime_error", message: runtimeMeta.message };
  }

  return { status: "accepted", message: "Submission Accepted" };
};
