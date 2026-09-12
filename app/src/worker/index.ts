import { processJob } from "@/isolate/job";
import type { RedisClientType } from "redis";
import { dequeueJob, enqueueResult } from "./redis";

export const consumeJobs = async (params: {
  isolateBoxId: number;
  redis: RedisClientType;
  signal?: AbortSignal;
}) => {
  const { isolateBoxId, signal, redis } = params;

  while (true) {
    signal?.throwIfAborted();
    try {
      // get job from redis, if no job in queue, just continue to next loop iteration
      // has the side effect of checking the abort signal, which we only do here
      // because we don't want to abort mid-job
      const job = await dequeueJob(redis);
      if (job == null) {
        continue;
      }

      const result = await processJob({ job, isolateBoxId });
      await enqueueResult(redis, result);
    } catch (e) {
      console.error(`Error in worker ${isolateBoxId}: `, e);
      console.error(`Worker ${isolateBoxId} - sleeping for 1000ms`);
      await Bun.sleep(1000);
    }
  }
};
