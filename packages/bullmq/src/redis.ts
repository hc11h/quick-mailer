import { Redis } from "ioredis";
import { getEnv } from "@trubo/env";

export const redisBullmqClient = new Redis(getEnv().REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
