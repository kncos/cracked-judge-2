import type { zJob, zJobResult } from "@/types";
import path from "node:path";
import type z from "zod";
import { isolate } from "./commands";
import { getBoxPath } from "./isolate-utils";

export const processJob = async (params: {
  job: z.infer<typeof zJob>;
  isolateBoxId: number;
}): Promise<z.infer<typeof zJobResult>> => {
  const { job, isolateBoxId } = params;

  const sandboxDir = path.join(getBoxPath(isolateBoxId), "/box");

  await Promise.all(
    job.files.map(({ name, contents }) =>
      Bun.write(path.join(sandboxDir, name), contents),
    ),
  );

  const commandResults: z.infer<typeof zJobResult>["commandResults"] = [];
  for (const cmd of job.commands) {
    // todo: add support for run options
    const result = await isolate.run({ ...cmd, box_id: isolateBoxId });
    commandResults.push(result);
  }

  const result: z.infer<typeof zJobResult> = {
    commandResults,
    id: job.id,
  };

  return result;
};
