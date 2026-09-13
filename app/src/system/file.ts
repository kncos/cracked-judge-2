import { CrackedError } from "@/cracked-error";
import path from "node:path";
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

export const relocateDir = async (params: {
  src: string;
  dst: string;
}): Promise<void> => {
  const { src, dst } = params;
  const absDst = path.resolve(dst);
  const absSrc = path.resolve(src);

  const mkdirRes = await sh(["mkdir", "-p", path.dirname(absDst)]);
  if (mkdirRes.exitCode !== 0) {
    throw new CrackedError("SYSTEM_ERROR", {
      message: stringifyShResult(mkdirRes, "relocateDir failed:"),
    });
  }

  const mvRes = await sh(["mv", absSrc, absDst]);
  if (mvRes.exitCode !== 0) {
    throw new CrackedError("SYSTEM_ERROR", {
      message: stringifyShResult(mvRes, "relocateDir failed:"),
    });
  }
};

export const makeNeighborSymlink = async (params: {
  dir: string;
  link_name: string;
}) => {
  const { dir, link_name } = params;
  const parent = path.dirname(dir);
  const relative_src = path.basename(dir);
  const link_full_path = path.join(parent, link_name);
  const ln = await sh(["ln", "-s", relative_src, link_full_path]);
  if (ln.exitCode !== 0) {
    throw new CrackedError("SYSTEM_ERROR", {
      message: stringifyShResult(ln, "makeNeighborSymlink failed"),
    });
  }
};

export const derefLink = async (dir: string) => {
  const realpath = await sh(["realpath", dir]);
  if (realpath.exitCode !== 0) {
    throw new CrackedError("SYSTEM_ERROR", {
      message: stringifyShResult(realpath, "derefLink failed"),
    });
  }
  return realpath.stdout.trim();
};
