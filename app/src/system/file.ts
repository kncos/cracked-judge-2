import { CrackedError } from "@/cracked-error";
import z from "zod";
import { sh, stringifyShResult } from "./shell";

export const hashDirContents = async (dir: string): Promise<string> => {
  const res = await sh(["hashdir", dir]);
  if (res.exitCode !== 0) {
    throw new CrackedError("SYSTEM_ERROR", {
      message: stringifyShResult(
        res,
        "Failed to hash directory contents. Hashdir output:",
      ),
    });
  }

  const hashOut = res.stdout.trim();
  const result = z.hash("sha256").safeParse(hashOut);
  if (!result.success) {
    throw new CrackedError("SYSTEM_ERROR", {
      message:
        `hashdir output was not a valid sha256 hash.\n` +
        `\tdirectory: ${dir}\n` +
        `\thashdir output: ${hashOut}\n`,
    });
  }

  return result.data;
};

export const relocateDir = async (dst: string, src: string): Promise<void> => {
  const res = await sh(["mkdir", "-p", dst, "&&", "mv", src, dst]);
  if (res.exitCode !== 0) {
    throw new CrackedError("SYSTEM_ERROR", {
      message: stringifyShResult(res, "relocateDir failed:"),
    });
  }
};
