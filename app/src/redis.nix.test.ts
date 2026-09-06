import { beforeEach, describe, expect, test } from "bun:test";
import type { Job, JobResult } from "./job";
import {
  createRedisClient,
  dequeueJob,
  dequeueResult,
  enqueueJob,
  enqueueResult,
} from "./redis";

describe("basic redis tests", () => {
  beforeEach(async () => {
    const redis = await createRedisClient();
    await redis.flushDb();
    redis.destroy();
  });

  test("enqueue/dequeue job works", async () => {
    const redis = await createRedisClient();
    const job: Job = {
      id: "hello",
    };

    await enqueueJob(redis, job);
    const popped = await dequeueJob(redis);
    expect(popped.id).toStrictEqual("hello");
    redis.destroy();
  });

  test("enqueue/dequeue job result works", async () => {
    const redis = await createRedisClient();
    const jobResult: JobResult = {
      id: "hello",
      success: true,
    };

    await enqueueResult(redis, jobResult);
    const popped = await dequeueResult(redis, "hello");
    expect(popped.success).toStrictEqual(true);
    expect(popped.id).toStrictEqual("hello");
    redis.destroy();
  });
});
