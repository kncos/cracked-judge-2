import { readFileSync } from "node:fs";
import path from "path";
import type z from "zod";
import { CrackedError } from "../cracked-error";
import { fileExists, stringifyProcResult } from "../utils";
import {
  interpretMeta,
  parseMeta,
  zIsolateMeta,
  zIsolateRunOpts,
} from "./isolate-utils";

// this is the default path template and is exactly what isolate init
// is returning, so we'll make the assumption that this will hold true for now
export const getBoxPath = (boxId: number) => `/var/lib/isolate/boxes/${boxId}`;

/**
 * Helper that runs the isolate --init command
 * @param boxId -- boxId to initialize
 * @returns boxpath -- absolute path to the sandbox root directory
 */
export const init = (boxId: number): string => {
  const cmd = ["isolate", "--cg", "--init", `--box-id=${boxId}`];
  const proc = Bun.spawnSync(cmd);
  if (proc.exitCode !== 0) {
    throw new CrackedError("ISOLATE_ERROR", {
      message: stringifyProcResult(cmd, proc),
    });
  }

  const boxpath = proc.stdout.toString().trim();
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
export const cleanup = (boxId: number) => {
  const cmd = ["isolate", "--cg", "--cleanup", `--box-id=${boxId}`];
  const proc = Bun.spawnSync(cmd);
  if (proc.exitCode !== 0) {
    throw new CrackedError("ISOLATE_ERROR", {
      message: stringifyProcResult(cmd, proc),
    });
  }
};

/**
 * Helper for running isolate's --run command.
 * @param runCmd command to execute under isolate. This could be a script, binary, etc.
 * @param params see zIsolateRunOpts
 * @returns
 */
export const run = (
  execCmd: string[],
  params: z.infer<typeof zIsolateRunOpts>,
): {
  stdout: string;
  stderr: string;
  meta: z.infer<typeof zIsolateMeta>;
} & ReturnType<typeof interpretMeta> => {
  // do this here to get the box path, but we won't rely on this.
  // with isolate, it's a no-op if init is run twice
  const boxPath = getBoxPath(params.box_id);
  const metaPath = path.join(boxPath, "box", "metadata.out");
  const stdoutPath = path.join(boxPath, "box", "stdout.txt");
  const stderrPath = path.join(boxPath, "box", "stderr.txt");

  // always want these args
  const cmd = [
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
        cmd.push(`${kAsArg}=${v as number}`);
        break;
      case "quota": {
        const { blocks, inodes } = v as NonNullable<(typeof params)["quota"]>;
        cmd.push(`${kAsArg}=${blocks},${inodes}`);
        break;
      }
      case "processes": {
        if (typeof v === "number") {
          cmd.push(`${kAsArg}=${v}`);
        }
        // if not a number, this can only be true. no check needed
        else {
          cmd.push(kAsArg);
        }
        break;
      }
    }
  }

  // separate isolate args from the command we're running using `--`
  cmd.push("--", ...execCmd);

  // unused, we don't actually want to run logging on this because
  // it should just exit with a metadata file with the info we need
  const proc = Bun.spawnSync(cmd);

  if (
    !fileExists(stdoutPath) ||
    !fileExists(stderrPath) ||
    !fileExists(metaPath)
  ) {
    const message =
      "Missing one or more output files:\n" +
      `  stdout: ${stdoutPath} - exists: ${fileExists(stdoutPath)}\n` +
      `  stderr: ${stderrPath} - exists: ${fileExists(stderrPath)}\n` +
      `  meta: ${metaPath} - exists: ${fileExists(metaPath)}\n`;

    throw new CrackedError("ISOLATE_ERROR", { message });
  }

  // relevant information from the runtime
  try {
    const stdout = readFileSync(stdoutPath).toString("utf-8");
    const stderr = readFileSync(stderrPath).toString("utf-8");
    const meta = parseMeta(readFileSync(metaPath).toString("utf-8"));
    return { stdout, stderr, meta, ...interpretMeta(meta) };
  } catch (e) {
    const lscmd = ["ls", "-lR", "/var/lib/isolate/"];
    const ls = Bun.spawnSync(lscmd);
    const message = [
      "=".repeat(20),
      stringifyProcResult(cmd, proc),
      "",
      stringifyProcResult(lscmd, ls),
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
