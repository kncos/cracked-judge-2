import { CrackedError } from "@/cracked-error";
import { ENV } from "@/env";
import { hashDirContents, relocateDir } from "@/system/file";
import type { zJob, zJobResult } from "@/types";
import { isDirectory, tryCatch } from "@/utils";
import path from "node:path";
import type z from "zod";
import { isolate } from "./commands";
import { getBoxPath } from "./isolate-utils";

export const processJob = async (params: {
  job: z.infer<typeof zJob>;
  isolateBoxId: number;
}): Promise<z.infer<typeof zJobResult>> => {
  const { job, isolateBoxId } = params;

  // initialize isolate box. errors can just pass through here
  await isolate.init(isolateBoxId);

  // ensure existence of sandbox directory
  const sandboxDir = path.join(getBoxPath(isolateBoxId), "/box");
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

  // write all of the files into the sandbox directory
  const { error: fileWriteErr } = await tryCatch(
    Promise.all(
      job.files.map(({ name, contents }) =>
        Bun.write(path.join(sandboxDir, name), contents),
      ),
    ),
  );
  if (fileWriteErr) {
    throw new CrackedError("OTHER", {
      message: "Failed to write job files",
      cause: fileWriteErr,
    });
  }

  const commandResults: z.infer<typeof zJobResult>["commandResults"] = [];
  for (const cmd of job.commands) {
    // todo: add support for run options
    const result = await isolate.run({ ...cmd, box_id: isolateBoxId });
    commandResults.push(result);
  }

  if (job.saveAsHash) {
    // pass through errs
    const hash = await hashDirContents(sandboxDir);
    const dst = path.join(ENV.JOB_SAVE_PATH, hash);
    await relocateDir(sandboxDir, dst);
  }

  await isolate.cleanup(isolateBoxId);

  const result: z.infer<typeof zJobResult> = {
    commandResults,
    id: job.id,
  };

  return result;
};
