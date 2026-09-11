import { createClient, type RedisClientType } from "redis";
import { z } from "zod";
import { zJob, zJobResult } from "./types";

export const zRedisConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().positive().default(6379),
  password: z.string().optional(),
  username: z.string().optional(),
  tls: z.boolean().default(false),
  db: z.number().int().min(0).max(15).default(0),
});
export type RedisConfig = z.infer<typeof zRedisConfigSchema>;

export const createRedisClient = async (params?: {
  config?: z.input<typeof zRedisConfigSchema>;
  signal?: AbortSignal;
}) => {
  const { config, signal } = params || {};
  const conf = zRedisConfigSchema.parse(config || {});
  let client = createClient({
    socket: conf.tls
      ? { host: conf.host, port: conf.port, tls: true }
      : { host: conf.host, port: conf.port },
    username: conf.username,
    password: conf.password,
    database: conf.db,
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
