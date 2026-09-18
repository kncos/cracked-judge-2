import { ENV } from "@/env";
import { consumeJobs } from "@/isolate/job";
import { createRedisClient } from "@/job-broker";
import { runPool } from "@/utils";

if (import.meta.main) {
  const abortController = new AbortController();
  const signal = abortController.signal;
  process.on("SIGINT", () => abortController.abort());
  process.on("SIGTERM", () => abortController.abort());
  process.on("SIGKILL", () => abortController.abort());
  runPool({
    worker: async (id) => {
      const client = await createRedisClient({ config: ENV });
      try {
        await consumeJobs({
          isolateBoxId: id as number,
          signal,
          redis: client,
        });
      } finally {
        client.destroy();
      }
    },
    shouldStop: () => signal.aborted,
    concurrency: ENV.ISOLATE_NUM_BOXES,
    onError(e) {
      console.log("Encountered error in runPool: ", e);
    },
  });
}

// re-export all types
export * from "@/types";
// re-export all redis stuff
export * from "@/job-broker";
