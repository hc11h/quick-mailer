import { config } from "dotenv";
import { z } from "zod";

export function loadEnv() {
  config();
}

const EnvSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RESEND_KEY: z.string().optional(),
  SENDER_MAIL: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  CLIENT_SERVER_LOCATION: z.string().default("http://localhost:5173"),
  PORT: z
    .string()
    .optional()
    .transform((v) => Number(v ?? 8080)),
});

export function getEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment configuration");
  }
  const e = parsed.data as any;
  return {
    REDIS_URL: e.REDIS_URL,
    RESEND_KEY: e.RESEND_KEY,
    SENDER_MAIL: e.SENDER_MAIL,
    MONGODB_URI: e.MONGODB_URI,
    CLIENT_SERVER_LOCATION: e.CLIENT_SERVER_LOCATION,
    PORT: e.PORT,
  };
}
