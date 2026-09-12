import path from "path";
import type z from "zod";
import { CrackedError } from "../cracked-error";
import { sh, stringifyShResult } from "../shell";
import { isStrArray, type zJobCommandResult } from "../types";
import {
  getBoxPath,
  interpretMeta,
  parseMeta,
  zIsolateRunOpts,
} from "./isolate-utils";

/**
 * Helper that runs the isolate --init command
 * @param boxId -- boxId to initialize
 * @returns boxpath -- absolute path to the sandbox root directory
 */
export const init = async (boxId: number): Promise<string> => {
  const cmd = ["isolate", "--cg", "--init", `--box-id=${boxId}`];
  const proc = await sh(cmd);
  if (proc.exitCode !== 0) {
    throw new CrackedError("ISOLATE_ERROR", {
      message: stringifyShResult(proc),
    });
  }

  const boxpath = proc.stdout.trim();
  // if the assumption breaks, we'll throw an error to prevent any path issues
  if (path.resolve(boxpath) !== path.resolve(getBoxPath(boxId))) {
    throw new CrackedError("ISOLATE_ERROR", {
      message:
        "Isolate init created unexpected box path:\n" +
        `  Expected: ${getBoxPath(boxId)}\n` +
        `  Found: ${boxpath}`,
    });
  }

  return boxpath;
};

/**
 * Helper that runs the isolate --cleanup command
 * @param boxId -- optional boxid to clean up, defaults to 0
 */
export const cleanup = async (boxId: number) => {
  const cmd = ["isolate", "--cg", "--cleanup", `--box-id=${boxId}`];
  const proc = await sh(cmd);
  if (proc.exitCode !== 0) {
    throw new CrackedError("ISOLATE_ERROR", {
      message: stringifyShResult(proc),
    });
  }
};

/**
 * Helper for running isolate's --run command.
 * @param runCmd command to execute under isolate. This could be a script, binary, etc.
 * @param params see zIsolateRunOpts
 * @returns
 */
export const run = async (
  params: z.infer<typeof zIsolateRunOpts>,
): Promise<z.infer<typeof zJobCommandResult>> => {
  // do this here to get the box path, but we won't rely on this.
  // with isolate, it's a no-op if init is run twice
  const boxPath = getBoxPath(params.box_id);
  const metaPath = path.join(boxPath, "box", "metadata.out");
  const stdoutPath = path.join(boxPath, "box", "stdout.txt");
  const stderrPath = path.join(boxPath, "box", "stderr.txt");

  // always want these args
  const shCmd = [
    "isolate",
    "--cg",
    "--run",
    "--dir=/nix/store/",
    "--dir=/run/current-system/sw",
    "--dir=/lib=",
    "--env=PATH=/run/current-system/sw/bin",
    `--meta=${metaPath}`,
    `--stdout=stdout.txt`,
    `--stderr=stderr.txt`,
  ];

  // default to 256 here, reasonably high limit, prevents many programs
  // from failing when the normal default prevents any forking whatsoever
  params.processes = params.processes ?? 256;

  // just used `|| {}` here because it will cause a no-op but not
  // require this whole block to be nested in an if statement
  for (const [k, v] of Object.entries(params || {})) {
    // we use the same names but just replace all `_` with `-`
    // see: https://www.ucw.cz/isolate/isolate.1.html for args
    const kAsArg = `--${k.replaceAll("_", "-")}`;

    switch (k as keyof typeof params) {
      case "time":
      case "cg_mem":
      case "wall_time":
      case "extra_time":
      case "stack":
      case "open_files":
      case "fsize":
      case "box_id":
        shCmd.push(`${kAsArg}=${v as number}`);
        break;
      case "quota": {
        const { blocks, inodes } = v as NonNullable<(typeof params)["quota"]>;
        shCmd.push(`${kAsArg}=${blocks},${inodes}`);
        break;
      }
      case "processes": {
        if (typeof v === "number") {
          shCmd.push(`${kAsArg}=${v}`);
        }
        // if not a number, this can only be true. no check needed
        else {
          shCmd.push(kAsArg);
        }
        break;
      }
      case "add_readonly_dirs": {
        if (isStrArray(v)) {
          v.forEach((pathStr) => shCmd.push(`--dir=${path.resolve(pathStr)}`));
        }
      }
    }
  }

  // separate isolate args from the command we're running using `--`
  shCmd.push("--", ...params.cmd);

  // unused, we don't actually want to run logging on this because
  // it should just exit with a metadata file with the info we need
  const proc = await sh(shCmd);

  const stdoutFile = Bun.file(stdoutPath);
  const stderrFile = Bun.file(stderrPath);
  const metaFile = Bun.file(metaPath);

  const stdoutExists = await stdoutFile.exists();
  const stderrExists = await stderrFile.exists();
  const metaExists = await metaFile.exists();

  if (!stdoutExists || !stderrExists || !metaExists) {
    const message =
      "Missing one or more output files:\n" +
      `  stdout: ${stdoutPath} - exists: ${stdoutExists}\n` +
      `  stderr: ${stderrPath} - exists: ${stderrExists}\n` +
      `  meta: ${metaPath} - exists: ${metaExists}\n`;
    throw new CrackedError("ISOLATE_ERROR", { message });
  }

  // relevant information from the runtime
  try {
    const stdout = await stdoutFile.text();
    const stderr = await stderrFile.text();
    const metaTxt = await metaFile.text();
    const meta = parseMeta(metaTxt);
    return { stdout, stderr, meta, ...interpretMeta(meta) };
  } catch (e) {
    const lscmd = ["ls", "-lR", "/var/lib/isolate/"];
    const ls = await sh(lscmd);
    const message = [
      "=".repeat(20),
      stringifyShResult(proc),
      "",
      stringifyShResult(ls),
      "=".repeat(20),
    ].join("\n");
    throw new CrackedError("ISOLATE_ERROR", {
      message,
      cause: e,
    });
  }
};

export const isolate = {
  init,
  run,
  cleanup,
} as const;
