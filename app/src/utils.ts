// Types for the result object with discriminated union
type Success<T> = {
  data: T;
  error: null;
};

type Failure<E> = {
  data: null;
  error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;
// Main wrapper function

export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}

export const indentStr = (
  str: string,
  count: number = 1,
  indent: string = "  ",
) => {
  const _indent = indent.repeat(count);
  return str.replace(/^/gm, _indent);
};

export const bufferToStrTruncate = (input: Buffer, maxLen: number = 256) => {
  const text = input.toString();
  return truncateStr(text, maxLen);
};

export const truncateStr = (text: string, maxLen: number = 256) => {
  if (maxLen <= 0) return text;

  if (text.length < maxLen) return text;

  const truncatedEnd = `... (truncated ${text.length - maxLen} chars)`;
  return `${text.slice(0, maxLen - truncatedEnd.length)}${truncatedEnd}`;
};

export type IsDirectoryResult = "is-dir" | "is-not-dir" | "does-not-exist";
export const isDirectory = async (
  pathStr: string,
): Promise<IsDirectoryResult> => {
  let isDir = false;
  try {
    const stat = await Bun.file(pathStr).stat();
    isDir = stat.isDirectory();
  } catch (e) {
    return "does-not-exist";
  }

  if (!isDir) {
    return "is-not-dir";
  }

  return "is-dir";
};

export const exitCodeSignalMapping: Record<number, NodeJS.Signals> = {
  129: "SIGHUP",
  130: "SIGINT",
  131: "SIGQUIT",
  132: "SIGILL",
  133: "SIGTRAP",
  134: "SIGABRT",
  135: "SIGBUS",
  136: "SIGFPE",
  137: "SIGKILL",
  138: "SIGUSR1",
  139: "SIGSEGV",
  140: "SIGUSR2",
  141: "SIGPIPE",
  142: "SIGALRM",
  143: "SIGTERM",
  144: "SIGSTKFLT",
  145: "SIGCHLD",
  146: "SIGCONT",
  147: "SIGSTOP",
  148: "SIGTSTP",
  149: "SIGTTIN",
  150: "SIGTTOU",
  151: "SIGURG",
  152: "SIGXCPU",
  153: "SIGXFSZ",
  154: "SIGVTALRM",
  155: "SIGPROF",
  156: "SIGWINCH",
  157: "SIGIO",
  158: "SIGPWR",
  159: "SIGSYS",
};

export const signalCodeMapping: Record<number, NodeJS.Signals> = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  4: "SIGILL",
  5: "SIGTRAP",
  6: "SIGABRT",
  7: "SIGBUS",
  8: "SIGFPE",
  9: "SIGKILL",
  10: "SIGUSR1",
  11: "SIGSEGV",
  12: "SIGUSR2",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
  16: "SIGSTKFLT",
  17: "SIGCHLD",
  18: "SIGCONT",
  19: "SIGSTOP",
  20: "SIGTSTP",
  21: "SIGTTIN",
  22: "SIGTTOU",
  23: "SIGURG",
  24: "SIGXCPU",
  25: "SIGXFSZ",
  26: "SIGVTALRM",
  27: "SIGPROF",
  28: "SIGWINCH",
  29: "SIGIO",
  30: "SIGPWR",
  31: "SIGSYS",
};

export interface PoolOptions<T> {
  /** The async task — called again after each settlement if not stopping. */
  worker: (id?: number) => Promise<T>;
  concurrency?: number;
  /** Once this returns true, no new workers are spawned and the pool drains. */
  shouldStop: () => boolean;
  onResult?: (result: T) => void;
  onError?: (error: unknown) => void;
}

export async function runPool<T>({
  worker,
  concurrency = 16,
  shouldStop,
  onResult,
  onError,
}: PoolOptions<T>): Promise<void> {
  const active = new Set<Promise<void>>();

  const spawn = (id: number): void => {
    if (shouldStop()) return; // drain mode — don't replace

    const task: Promise<void> = worker(id)
      .then((result) => onResult?.(result))
      .catch((error) => onError?.(error))
      .finally(() => {
        active.delete(task);
        spawn(id); // self-replacing: no-op once shouldStop() is true
      });

    active.add(task);
  };

  // Seed the pool
  for (let i = 0; i < concurrency; i++) {
    spawn(i);
  }

  // Drain: wait for all active tasks to settle
  while (active.size > 0) {
    await Promise.race(active);
  }
}
