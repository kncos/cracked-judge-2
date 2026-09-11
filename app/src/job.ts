import { $ } from "bun";
import path from "node:path";
import type { RedisClientType } from "redis";
import type z from "zod";
import { isolate } from "./isolate/commands";
import { getBoxPath } from "./isolate/isolate-utils";
import { dequeueJob, enqueueResult } from "./redis";
import type { zJobResult } from "./types";

const getDepFilename = (hash: string) =>
  path.join("/opt/cracked-judge", `${hash}.tar`);

export const processJob = async (params: {
  redis: RedisClientType;
  isolateBoxId?: number;
  depsBase?: string;
  signal?: AbortSignal;
}) => {
  const {
    redis,
    isolateBoxId = 0,
    depsBase = "/opt/cracked-judge/",
    signal,
  } = params;
  const sandboxDir = path.join(getBoxPath(isolateBoxId), "/box");

  const job = await dequeueJob(redis, signal);

  if (job.hashesToLoad) {
    await Promise.all(
      job.hashesToLoad.map(
        (hash) => $`tar -xf - -C ${sandboxDir} < ${getDepFilename(hash)}`,
      ),
    );
  }

  await Promise.all(
    job.files.map(({ name, contents }) =>
      Bun.write(path.join(sandboxDir, name), contents),
    ),
  );

  const commandResults: z.infer<typeof zJobResult>["commandResults"] = [];
  for (const command of job.commands) {
    // todo: add support for run options
    const result = isolate.run(command, {
      box_id: isolateBoxId,
    });
    commandResults.push(result);
  }

  const result: z.infer<typeof zJobResult> = {
    commandResults,
    id: job.id,
  };

  await enqueueResult(redis, result);
};

export const processJobs = async (params: {
  redis: RedisClientType;
  isolateBoxId?: number;
  signal?: AbortSignal;
}) => {
  const { redis, isolateBoxId = 0, signal } = params;

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await processJob({
      redis,
      signal,
      isolateBoxId,
    });
  }
};
