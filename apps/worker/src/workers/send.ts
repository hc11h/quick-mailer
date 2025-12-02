import { Worker } from "bullmq";
import { queuesName, redisBullmqClient } from "@trubo/bullmq";  
import { sendEmail } from "../lib/resend.js";


const worker = new Worker(queuesName.send, async (job) => {
  return await sendEmail(job.data);
}, {
  connection: redisBullmqClient,
  concurrency: 20,
  prefix: "trubo",
  limiter: { max: 200, duration: 1000 }
});

worker.on("completed", async (job, _result) => {
  process.stdout.write(`[worker] completed ${String(job.id)}\n`);
});
worker.on("failed", async (job, err) => {
  process.stdout.write(`[worker] failed ${String(job?.id ?? "")} reason=${String(err?.message ?? "error")}\n`);
});
