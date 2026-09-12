import "dotenv/config";
import z from "zod";

const zEnv = z.object({
  JOB_SAVE_PATH: z.string().default("/opt/cracked-judge"),

  // redis stuff
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_TLS: z.literal(true).optional(),
  REDIS_DB: z.number().int().min(0).max(15).default(0),

  ISOLATE_NUM_BOXES: z.number().int().min(1).max(63).default(1),
});

export const ENV = zEnv.parse(process.env);
