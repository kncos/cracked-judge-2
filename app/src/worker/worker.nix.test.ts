import { ENV } from "@/env";
import type { zJob, zJobResult } from "@/types";
import { randomUUIDv7 } from "bun";
import { afterAll, beforeAll, describe, it } from "bun:test";
import path from "node:path";
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

const c_program = `#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static int is_prime(int n) {
    if (n < 2) return 0;
    if (n == 2 || n == 3) return 1;
    if (n % 2 == 0 || n % 3 == 0) return 0;
    for (int i = 5; i * i <= n; i += 6)
        if (n % i == 0 || n % (i + 2) == 0) return 0;
    return 1;
}

static int nth_prime(int n) {
    int count = 0, candidate = 1;
    while (count < n)
        if (is_prime(++candidate)) count++;
    return candidate;
}

int main(void) {
    srand(time(NULL));
    int n = 500000 + rand() % 1000000;
    printf("%d-th prime: %d\\n", n, nth_prime(n));
    return 0;
}
`;

const submitJob = async (
  job: z.infer<typeof zJob>,
): Promise<z.infer<typeof zJobResult> | null> => {
  const redis = await createRedisClient();

  await enqueueJob(redis, job);
  for (let i = 0; i < 5; i++) {
    const res = await dequeueResult(redis, job.id);
    if (res !== null) {
      return res;
    }
  }
  return null;
};

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

  it.skip("running consumer", async () => {
    // 3 random IDs
    const ids = [randomUUIDv7(), randomUUIDv7(), randomUUIDv7()];

    const jobs = ids.map((id) => ({
      id,
      files: [
        {
          name: "main.py",
          contents: c_program,
        },
        {
          name: "run.sh",
          contents: "python -X jit -E -S -B -u main.py",
        },
      ],
      commands: [{ cmd: ["/bin/sh", "run.sh"] }],
      saveAsHash: true,
    }));

    for (const job of jobs) {
      const res = await submitJob(job);
      console.error("RESULT:\n", JSON.stringify(res, null, 2));
    }
  });

  it("using cached result", async () => {
    const compileId = randomUUIDv7();

    const job1 = {
      id: compileId,
      files: [
        {
          name: "main.c",
          contents: c_program,
        },
        {
          name: "compile.sh",
          contents: "gcc main.c -c",
        },
      ],
      commands: [{ cmd: ["/bin/sh", "compile.sh"] }],
      saveAsHash: true,
    } satisfies z.infer<typeof zJob>;

    const result1 = await submitJob(job1);
    console.error("RESULT 1:\n", JSON.stringify(result1, null, 2));

    // can just use the id to look it up
    // const job1SavePath = await derefLink(
    //   path.join(ENV.JOB_SAVE_PATH, compileId),
    // );
    const job1SavePath = path.join(ENV.JOB_SAVE_PATH, compileId);

    const runId = randomUUIDv7();
    const job2 = {
      id: runId,
      files: [
        {
          name: "compile.sh",
          contents: `gcc ${path.join(job1SavePath, "main.o")} -o main`,
        },
        {
          name: "run.sh",
          contents: "./main",
        },
      ],
      commands: [
        {
          cmd: ["/bin/sh", "compile.sh"],
          add_readonly_dirs: [job1SavePath],
        },
        { cmd: ["/bin/sh", "run.sh"] },
      ],
    } satisfies z.infer<typeof zJob>;

    const result2 = await submitJob(job2);
    console.error("RESULT 2:\n", JSON.stringify(result2, null, 2));
  });
});
