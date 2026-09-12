import { ENV } from "@/env";
import { consumeJobs } from "@/worker";
import { runPool } from "@/worker/pool";
import { createRedisClient } from "@/worker/redis";

const abortController = new AbortController();
const signal = abortController.signal;
process.on("SIGINT", () => abortController.abort());
process.on("SIGTERM", () => abortController.abort());
process.on("SIGKILL", () => abortController.abort());

if (import.meta.main) {
  runPool({
    worker: async (id) => {
      const client = await createRedisClient();
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
