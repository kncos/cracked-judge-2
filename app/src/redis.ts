import { createClient, type RedisClientType } from "redis";
import { z } from "zod";
import { ENV } from "./env";
import { zJob, zJobResult } from "./types";

export const createRedisClient = async (params?: { signal?: AbortSignal }) => {
  const { signal } = params || {};
  let client = createClient({
    socket: ENV.REDIS_TLS
      ? { host: ENV.REDIS_HOST, port: ENV.REDIS_PORT, tls: ENV.REDIS_TLS }
      : { host: ENV.REDIS_HOST, port: ENV.REDIS_PORT },
    username: ENV.REDIS_USERNAME,
    password: ENV.REDIS_PASSWORD,
    database: ENV.REDIS_DB,
  });
  if (signal) client = client.withAbortSignal(signal);

  client.on("error", (err: Error) => console.error("Redis error:", err));
  await client.connect();
  return client as RedisClientType;
};

export const withRedisRetry = async <T>(params: {
  fn: () => Promise<T>;
  signal?: AbortSignal;
  maxRetries?: number;
  baseDelayMs?: number;
  exponentialBackoff?: boolean;
}): Promise<T> => {
  const {
    fn,
    signal,
    maxRetries = 10,
    baseDelayMs = 100,
    exponentialBackoff = true,
  } = params;

  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted) throw err;

      const code = (err as NodeJS.ErrnoException).code;
      const recoverable = [
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ECONNRESET",
        "EAI_AGAIN",
      ].includes(code ?? "");

      if (!recoverable || ++retries >= maxRetries) throw err;

      const delay = exponentialBackoff
        ? Math.min(baseDelayMs * 2 ** retries, 5000)
        : baseDelayMs;

      await Bun.sleep(delay);
    }
  }
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
  signal?: AbortSignal,
): Promise<z.infer<typeof zJob>> => {
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await redis.brPop(JOBS_QUEUE, 1);
    if (res != null) {
      return zJob.parse(JSON.parse(res.element));
    }
  }
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
  signal?: AbortSignal,
): Promise<z.infer<typeof zJobResult>> => {
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await redis.brPop(getResultKey(jobId), 1);
    if (res != null) {
      return zJobResult.parse(JSON.parse(res.element));
    }
  }
};
