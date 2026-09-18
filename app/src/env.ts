import "dotenv/config";
import z from "zod";
import { zRedisConfig } from "./types";

const zEnv = z
  .object({
    JOB_SAVE_PATH: z.string().default("/opt/cracked-judge"),
    ISOLATE_NUM_BOXES: z.number().int().min(1).max(63).default(1),
  })
  .extend(zRedisConfig.shape);

export const ENV = zEnv.parse(process.env);
