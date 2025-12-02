import { Redis } from "ioredis";
import { env } from "@trubo/env";

export const redisBullmqClient = new Redis(env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
