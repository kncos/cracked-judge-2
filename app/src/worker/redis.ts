import { CrackedError } from "@/cracked-error";
import { createClient, type RedisClientType } from "redis";
import { z } from "zod";
import { ENV } from "../env";
import { zJob, zJobResult } from "../types";

const RedisErrorCodes = [
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
] as const;
type REDIS_ERROR_CODE = (typeof RedisErrorCodes)[number];

interface NodeRedisError extends Error {
  code?: REDIS_ERROR_CODE;
}

export const createRedisClient = async (params?: {
  maxRetries?: number;
  maxBackoffMs?: number;
  initialBackoffMs?: number;
}) => {
  const {
    maxRetries = 5,
    maxBackoffMs = 60 * 1000,
    initialBackoffMs = 1 * 1000,
  } = params || {};

  const client = createClient({
    socket: ENV.REDIS_TLS
      ? { host: ENV.REDIS_HOST, port: ENV.REDIS_PORT, tls: ENV.REDIS_TLS }
      : { host: ENV.REDIS_HOST, port: ENV.REDIS_PORT },
    username: ENV.REDIS_USERNAME,
    password: ENV.REDIS_PASSWORD,
    database: ENV.REDIS_DB,
  });

  client.on("error", (err: Error) => console.error("Redis error:", err));

  let retries = 0;
  let backoff = initialBackoffMs;
  while (true) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (retries >= maxRetries) {
        throw new CrackedError("REDIS_ERROR", {
          message: "Could not connect to redis client. Max retries exceeded.",
          cause: err,
        });
      }

      retries += 1;
      await Bun.sleep(backoff);
      backoff = Math.min(backoff * 2, maxBackoffMs);
    }
  }

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
