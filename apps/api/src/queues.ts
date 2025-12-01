import { Queue, Worker } from "bullmq";
import { env } from "./env";
import { logJobStatus } from "./db";

const connection = { url: env.REDIS_URL } as const;

const send = new Queue("send", { connection });

if (process.env.NODE_ENV !== "test") {
  const worker = new Worker(
    "send",
    async (job) => {
      return { ok: true, id: job.id };
    },
    { connection }
  );

  worker.on("completed", async (job, result) => {
    await logJobStatus(String(job.id), "completed", result, null);
  });
  worker.on("failed", async (job, err) => {
    await logJobStatus(String(job?.id ?? ""), "failed", null, err?.message ?? "error");
  });
}

export const queues = {
  send,
  high: send,
  medium: send,
  low: send,
};
