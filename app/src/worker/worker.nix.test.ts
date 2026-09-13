import type { zJob } from "@/types";
import { randomUUIDv7 } from "bun";
import { afterAll, beforeAll, describe, it } from "bun:test";
import type { RedisClientType } from "redis";
import type z from "zod";
import { consumeJobs } from ".";
import { createRedisClient, dequeueResult, enqueueJob } from "./redis";

const python = `import math
import time
import random

def is_prime(n: int) -> bool:
    """Trial division via 6k±1 — O(sqrt(n)) time, O(1) memory."""
    if n < 2:
        return False
    if n in (2, 3):
        return True
    if n % 2 == 0 or n % 3 == 0:
        return False
    i = 5
    while i * i <= n:
        if n % i == 0 or n % (i + 2) == 0:
            return False
        i += 6
    return True


def nth_prime(n: int) -> int:
    """
    Return the n-th prime (1-indexed) using trial division.

    Memory: O(1) — only tracks a counter and current candidate.
    Time:   O(n * sqrt(p_n)) where p_n ≈ n·ln(n)

    Rough CPython 3.x ballpark on a modern CPU:
        n=15_000  →  ~500ms
        n=55_000  →  ~2000ms
    (Run the calibration below to find your machine's sweet spot.)
    """
    if n < 1:
        raise ValueError("n must be >= 1")
    count = 0
    candidate = 1
    while count < n:
        candidate += 1
        if is_prime(candidate):
            count += 1
    return candidate

if __name__ == "__main__":
    n = random.randint(50000, 100000)
    prime = nth_prime(n)
    print(f"{n}-th prime: {prime}")
`;

describe("job consumer test", () => {
  let redis: RedisClientType | null = null;
  let controller: AbortController | null = null;

  beforeAll(async () => {
    redis = await createRedisClient();
    await redis.flushAll();
    controller = new AbortController();
    consumeJobs({
      isolateBoxId: 0,
      redis,
      signal: controller.signal,
    }).catch((e) => {
      if (e instanceof Error && e.name === "AbortError") {
        return;
      } else {
        console.error("unexpected error in consumeJobs: ", e);
      }
    });
  });

  afterAll(async () => {
    controller?.abort();
  });

  it("running consumer", async () => {
    // 3 random IDs
    const ids = [randomUUIDv7(), randomUUIDv7(), randomUUIDv7()];

    for (const id of ids) {
      const job = {
        id,
        files: [
          {
            name: "main.py",
            contents: python,
          },
          {
            name: "run.sh",
            contents: "python -X jit -E -S -B -u main.py",
          },
        ],
        commands: [{ cmd: ["/bin/sh", "run.sh"] }],
        saveAsHash: true,
      } satisfies z.infer<typeof zJob>;

      await enqueueJob(redis!, job);
    }

    const consumeResult = async (
      jobId: string,
      retries: number = 5,
      blockSecs: number = 1,
    ) => {
      for (let i = 0; i < retries; i++) {
        const res = await dequeueResult(redis!, jobId, blockSecs);
        if (res !== null) return res;
      }
      return null;
    };

    for (const id of ids) {
      const result = await consumeResult(id);
      console.error("RESULT:\n", JSON.stringify(result, null, 2), "\n");
    }
  });
});
