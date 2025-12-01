export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  MONGODB_URI: process.env.MONGODB_URI ?? "",
};
