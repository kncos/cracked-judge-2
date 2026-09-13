import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanup, init, run } from "./commands";

const testbin = "/run/current-system/sw/bin/isolate-test-program";
const BOX_ID = 0;

const printres = (input: Awaited<ReturnType<typeof run>>) => {
  console.log(">>> STDOUT:");
  console.log(input.stdout?.slice(0, 2048));
  console.log(">>> STDERR:");
  console.log(input.stderr?.slice(0, 2048));
  console.log(">>> meta:");
  console.log(JSON.stringify(input.meta, null, 2));
};

describe.skip("Judge Status Results", () => {
  beforeEach(async () => {
    await init(BOX_ID);
  });

  afterEach(async () => {
    await cleanup(BOX_ID);
  });

  it("AC — clean zero exit", async () => {
    const result = await run({
      cmd: [testbin, "--exitcode=0"],
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("accepted");
      expect(result.meta.exitcode).toBe(0);
      expect(result.meta.killed).toBe(false);
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("WA — reserved exit code 69", async () => {
    const result = await run({
      cmd: [testbin, "--exitcode=69"],
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("wrong_answer");
      expect(result.meta.exitcode).toBe(69);
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("RE — non-zero non-69 exit code", async () => {
    const result = await run({
      cmd: [testbin, "--exitcode=1"],
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("runtime_error");
      expect(result.meta.status).toBe("RE");
      expect(result.meta.exitcode).toBe(1);
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("RE — unhandled exception (panic)", async () => {
    const result = await run({ cmd: [testbin, "--throw"], box_id: BOX_ID });
    try {
      expect(result.status).toBe("runtime_error");
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("RE — segfault (SIGSEGV)", async () => {
    const result = await run({
      cmd: [testbin, "--exitsig=11"],
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("runtime_error");
      expect(result.meta.status).toBe("SG");
      expect(result.meta.exitsig).toBeDefined();
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("TLE — CPU time limit exceeded", async () => {
    const result = await run({
      cmd: [testbin, "--time=5"],
      time: 1,
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("time_limit_exceeded");
      expect(result.meta.status).toBe("TO");
      expect(result.meta.killed).toBe(true);
      expect(result.meta.time).toBeGreaterThanOrEqual(1);
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("TLE — wall clock time limit exceeded", async () => {
    const result = await run({
      cmd: [testbin, "--sleep=5"],
      wall_time: 1,
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("time_limit_exceeded");
      expect(result.meta.status).toBe("TO");
      expect(result.meta.killed).toBe(true);
      expect(result.meta.time_wall).toBeGreaterThanOrEqual(1);
      expect(result.meta.time).toBeLessThan(0.5);
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("MLE — exceeds cgroup memory limit", async () => {
    const result = await run({
      cmd: [testbin, "--memory=256"],
      cg_mem: 65536,
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("memory_limit_exceeded");
      expect(result.meta.cg_oom_killed).toBe(true);
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("OLE — stdout exceeds fsize limit", async () => {
    const result = await run({
      cmd: [testbin, "--write=64,stdout"],
      fsize: 1024,
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("output_limit_exceeded");
      expect(result.meta.status).toBe("SG");
      expect(result.meta.exitsig).toBeDefined();
    } catch (e) {
      printres(result);
      throw e;
    }
  });

  it("OLE — file write exceeds fsize limit", async () => {
    const result = await run({
      cmd: [testbin, "--write=64,out.bin"],
      fsize: 1024,
      box_id: BOX_ID,
    });
    try {
      expect(result.status).toBe("output_limit_exceeded");
      expect(result.meta.status).toBe("SG");
      expect(result.meta.exitsig).toBeDefined();
    } catch (e) {
      printres(result);
      throw e;
    }
  });
});
