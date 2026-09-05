import { createRedisClient, dequeueJob, enqueueJob } from "./src/redis";

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGABRT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());
const signal = controller.signal;

const redis = await createRedisClient({
  signal,
});

for (let i = 0; i < 5; i++) {
  if (signal.aborted) break;

  await enqueueJob(redis, { id: "random-id" });
  const dequeued = await dequeueJob(redis, signal);
  console.log(JSON.stringify(dequeued));
}
