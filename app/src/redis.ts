import Redis from "ioredis";
import type { Job, JobResult } from "./job";

const JOBS_QUEUE = "jobs";
export class JobManager {
  redis: Redis;

  constructor() {
    this.redis = new Redis();
  }

  async enqueueJob(job: Job) {
    const payload = JSON.stringify(job);
    await this.redis.lpush(JOBS_QUEUE, payload);
  }

  async dequeueJob(params?: { timeout?: number }): Promise<Job> {
    const { timeout = 30 } = params || {};
    const result = await this.redis.brpop(JOBS_QUEUE, timeout);
    if (result == null || result == undefined) {
      throw new Error(`timed out waiting for jobs queue: ${JOBS_QUEUE}`);
    }
    return JSON.parse(result[1]) as Job;
  }

  async enqueueResult(result: JobResult) {
    const payload = JSON.stringify(result);
    await this.redis.lpush(payload);
  }

  async dequeueResult(params: {
    jobId: string;
    timeout?: number;
  }): Promise<JobResult> {
    const { jobId, timeout = 30 } = params;
    const result = await this.redis.brpop(`result:${jobId}`, timeout);
    if (result == null || result == undefined) {
      throw new Error(`Job ${jobId} timed out`);
    }
    return JSON.parse(result[1]);
  }
}
