import path from "node:path";
import z from "zod";
import { CrackedError } from "../cracked-error";
import { zIsolateMeta, type JudgeStatus } from "../types";
import { isDirectory, signalCodeMapping } from "../utils";

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

// this is the default path template and is exactly what isolate init
// is returning, so we'll make the assumption that this will hold true for now
export const getBoxPath = (boxId: number) => `/var/lib/isolate/boxes/${boxId}`;

export const getValidSandboxWorkdir = async (boxId: number) => {
  const sandboxDir = path.join(getBoxPath(boxId), "/box");
  const isDir = await isDirectory(sandboxDir);
  if (isDir === "does-not-exist") {
    throw new CrackedError("ISOLATE_ERROR", {
      message: `Failed to stat directory: ${sandboxDir}`,
    });
  } else if (isDir == "is-not-dir") {
    throw new CrackedError("ISOLATE_ERROR", {
      message: `${sandboxDir} Exists but is not a directory.`,
    });
  }

  return sandboxDir;
};
