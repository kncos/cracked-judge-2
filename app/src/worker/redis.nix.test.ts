import { beforeEach, describe, expect, test } from "bun:test";
import type z from "zod";
import type { zJob, zJobResult } from "../types";
import {
  createRedisClient,
  dequeueJob,
  dequeueResult,
  enqueueJob,
  enqueueResult,
} from "./redis";

describe.skip("basic redis tests", () => {
  beforeEach(async () => {
    const redis = await createRedisClient();
    await redis.flushDb();
    redis.destroy();
  });

  test("enqueue/dequeue job works", async () => {
    const redis = await createRedisClient();
    const job = {
      commands: [],
      files: [],
      id: "hello",
    } as z.infer<typeof zJob>;

    await enqueueJob(redis, job);
    const popped = await dequeueJob(redis);
    expect(popped?.id).toStrictEqual("hello");
    redis.destroy();
  });

  test("enqueue/dequeue job result works", async () => {
    const redis = await createRedisClient();
    const jobResult: z.infer<typeof zJobResult> = {
      id: "hello",
      commandResults: [],
    };

    await enqueueResult(redis, jobResult);
    const popped = await dequeueResult(redis, "hello");
    expect(popped?.id).toStrictEqual("hello");
    redis.destroy();
  });
});
