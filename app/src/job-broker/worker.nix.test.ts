import { ENV } from "@/env";
import type { zJob, zJobResult } from "@/types";
import { randomUUIDv7 } from "bun";
import { describe, it } from "bun:test";
import path from "node:path";
import type z from "zod";
import { createRedisClient, dequeueResult, enqueueJob } from ".";

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

const cpp_program = `#include "test_runner.hpp"

// A stateful C++ class with non-static member functions
class BankAccount {
  int64_t balance = 0;
  size_t transaction_count = 0;

public:
  void deposit(int64_t amount) {
    balance += amount;
    ++transaction_count;
  }

  int64_t withdraw(int64_t amount) {
    if (amount <= balance) {
      balance -= amount;
      ++transaction_count;
    }
    return balance;
  }

  int64_t get_balance() const {
    return balance;
  }

  size_t get_transactions() const {
    return transaction_count;
  }
};

// Custom aggregate struct (automatically reflected by Glaze)
struct Coordinate {
  int64_t x{};
  int64_t y{};
};

// Functions with complex signatures and custom parameter names
struct Operations {
  static int64_t add(int64_t a, int64_t b) {
    return a + b;
  }

  static int64_t matrix_sum(std::vector<std::vector<int64_t>> matrix) {
    int64_t sum = 0;
    for (const auto& row : matrix) {
      for (auto v : row) sum += v;
    }
    return sum;
  }

  static int64_t dot_target(Coordinate target, int64_t factor) {
    return (target.x + target.y) * factor;
  }
};


int main() {
  // Test suite where calls mutate and depend on previous state
  std::string json = R"(
  {
    "data": [
      { "fn": "deposit", "amount": 100 },
      { "fn": "deposit", "amount": 50 },
      { "fn": "get_balance", "expect": 150 },
      { "fn": "withdraw", "amount": 40, "expect": 110 },
      { "fn": "get_transactions", "expect": 3 }
    ]
  }
  )";

  // Instantiate the object
  BankAccount account;

  // Run tests - state persists inside \`account\` across every step!
  bool success = test_runner::run(account, json);

  std::cout << "Final account balance: " << account.get_balance() << "\\n";
  std::cout << "bank account test runner success: ";
  if (success)
    std::cout << "true";
  else
    std::cout << "false";
  std::cout << std::endl;

  std::string json2 = R"(
  {
    "data": [
      { "fn": "add", "a": 2, "b": 3, "expect": 5 },
      { "fn": "matrix_sum", "matrix": [[1, 2], [3, 4]], "expect": 10 },
      { "fn": "dot_target", "factor": 10, "target": {"x": 3, "y": 4}, "expect": 70 }
    ]
  }
  )";

  bool success2 = test_runner::run<Operations>(json2);
  std::cout << "operations test runner success: ";
  if (success2)
    std::cout << "true";
  else
    std::cout << "false";
  std::cout << std::endl;

  return (success && success2) ? 0 : 1;
}
`;

const submitJob = async (
  job: z.infer<typeof zJob>,
): Promise<z.infer<typeof zJobResult> | null> => {
  const redis = await createRedisClient({
    config: ENV,
  });

  await enqueueJob(redis, job);
  for (let i = 0; i < 20; i++) {
    const res = await dequeueResult(redis, job.id);
    if (res !== null) {
      return res;
    }
  }
  return null;
};

describe("job consumer test", () => {
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

  it("c++ dependency check", async () => {
    const id = randomUUIDv7();
    const job = {
      id,
      files: [
        {
          name: "main.cpp",
          contents: cpp_program,
        },
        {
          name: "compile.sh",
          contents: "judge-c++ main.cpp -o main",
        },
        {
          name: "run.sh",
          contents: "./main",
        },
      ],
      commands: [
        { cmd: ["/bin/sh", "compile.sh"] },
        { cmd: ["/bin/sh", "run.sh"] },
      ],
    };

    const res = await submitJob(job);
    console.error("RESULT:\n", JSON.stringify(res, null, 2));
  });

  it.skip("using cached result", async () => {
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
