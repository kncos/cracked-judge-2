import { CrackedError } from "@/cracked-error";
import { ENV } from "@/env";
import {
  hashDirContents,
  makeNeighborSymlink,
  relocateDir,
} from "@/system/file";
import type { zJob, zJobResult } from "@/types";
import path from "node:path";
import type z from "zod";
import { isolate } from "./commands";
import { getValidSandboxWorkdir } from "./isolate-utils";

const saveAsHash = async (dir: string, id?: string) => {
  const hash = await hashDirContents(dir);
  const dst = path.join(ENV.JOB_SAVE_PATH, hash);
  await relocateDir({ src: dir, dst });
  if (id) {
    await makeNeighborSymlink({
      dir: dst,
      link_name: id,
    });
  }
};

const writeJobFiles = async (params: {
  files: z.infer<typeof zJob>["files"];
  base_dir: string;
}) => {
  const { files, base_dir } = params;
  try {
    const writeOps = files.map(({ name, contents }) =>
      Bun.write(path.join(base_dir, name), contents),
    );
    await Promise.all(writeOps);
  } catch (e) {
    throw new CrackedError("OTHER", {
      message: "Failed to write job files",
      cause: e,
    });
  }
};

export const processJob = async (params: {
  job: z.infer<typeof zJob>;
  isolateBoxId: number;
}): Promise<z.infer<typeof zJobResult>> => {
  const { job, isolateBoxId } = params;

  // initialize isolate box. errors can just pass through here
  await isolate.init(isolateBoxId);

  // ensure existence of sandbox directory
  const sandboxDir = await getValidSandboxWorkdir(isolateBoxId);

  // write all of the files into the sandbox directory
  await writeJobFiles({
    files: job.files,
    base_dir: sandboxDir,
  });

  const commandResults: z.infer<typeof zJobResult>["commandResults"] = [];
  for (const cmd of job.commands) {
    // todo: add support for run options
    const result = await isolate.run({ ...cmd, box_id: isolateBoxId });
    commandResults.push(result);
  }

  if (job.saveAsHash) {
    await saveAsHash(sandboxDir, job.id);
  }

  await isolate.cleanup(isolateBoxId);

  const result: z.infer<typeof zJobResult> = {
    commandResults,
    id: job.id,
  };

  return result;
};
