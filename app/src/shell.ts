import { spawn } from "bun";
import { indentStr, truncateStr } from "./utils";

export type ShResult = {
  cmd: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  pid: number;
};

export const sh = async (cmd: string[]): Promise<ShResult> => {
  const proc = spawn(cmd, {
    stderr: "pipe",
    stdout: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await proc.stdout.text();
  const stderr = await proc.stderr.text();
  const pid = proc.pid;

  return {
    cmd: [...cmd],
    exitCode,
    stdout,
    stderr,
    pid,
  };
};

export const stringifyShResult = (result: ShResult, header?: string) => {
  const body = [
    `  command: ${result.cmd.join(" ")}`,
    `  exit code: ${result.exitCode || "null (not exited?)"}`,
    `  pid: ${result.pid}`,
    "  stdout:",
    result.stdout ? indentStr(truncateStr(result.stdout, 256), 1, ">   ") : "",
    `  stderr:`,
    result.stderr ? indentStr(truncateStr(result.stderr, 256), 1, ">   ") : "",
  ].join("\n");

  if (header) {
    return [header, body].join("\n");
  }
  return body;
};
