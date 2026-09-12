import { createClient, type RedisClientType } from "redis";
import { z } from "zod";
import { ENV } from "../env";
import { zJob, zJobResult } from "../types";

export const createRedisClient = async () => {
  let client = createClient({
    socket: ENV.REDIS_TLS
      ? { host: ENV.REDIS_HOST, port: ENV.REDIS_PORT, tls: ENV.REDIS_TLS }
      : { host: ENV.REDIS_HOST, port: ENV.REDIS_PORT },
    username: ENV.REDIS_USERNAME,
    password: ENV.REDIS_PASSWORD,
    database: ENV.REDIS_DB,
  });

  client.on("error", (err: Error) => console.error("Redis error:", err));
  await client.connect();
  return client as RedisClientType;
};

const TTL_SECONDS = 3600;
const getResultKey = (id: string) => `job:${id}`;
const JOBS_QUEUE = "jobs";

export const enqueueJob = async (
  redis: RedisClientType,
  job: z.infer<typeof zJob>,
) => {
  const payload = JSON.stringify(job);
  return await redis
    .multi()
    .lPush(JOBS_QUEUE, payload)
    .expire(JOBS_QUEUE, TTL_SECONDS)
    .exec();
};

export const dequeueJob = async (
  redis: RedisClientType,
  blockSecs: number = 1,
): Promise<z.infer<typeof zJob> | null> => {
  const res = await redis.brPop(JOBS_QUEUE, blockSecs);
  if (res != null) {
    return zJob.parse(JSON.parse(res.element));
  }
  return null;
};

export const enqueueResult = async (
  redis: RedisClientType,
  result: z.infer<typeof zJobResult>,
) => {
  const { id } = result;
  const payload = JSON.stringify(result);
  return await redis
    .multi()
    .lPush(getResultKey(id), payload)
    .expire(getResultKey(id), TTL_SECONDS)
    .exec();
};

export const dequeueResult = async (
  redis: RedisClientType,
  jobId: string,
  blockSecs: number = 1,
): Promise<z.infer<typeof zJobResult> | null> => {
  const res = await redis.brPop(getResultKey(jobId), blockSecs);
  if (res != null) {
    return zJobResult.parse(JSON.parse(res.element));
  }
  return null;
};
