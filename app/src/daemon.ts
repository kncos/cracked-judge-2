import { randomUUIDv7 } from "bun";
import { JobManager } from "./redis";

export class Daemon {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private jobManager: JobManager;

  constructor() {
    this.jobManager = new JobManager();
  }

  private async loop() {
    console.log("daemon started");
    while (this.running) {
      try {
        const res = await this.jobManager.dequeueJob();
        console.log(`daemon got job:\n${JSON.stringify(res, null, 2)}`);
        await this.jobManager.enqueueResult({
          id: randomUUIDv7(),
          success: true,
        });
      } catch (e) {
        console.error(`Exception in daemon: ${e}`);
        console.error("Continuing...");
      }
    }
    console.log("daemon stopped");
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop() {
    this.running = false;
    await this.loopPromise;
  }
}
