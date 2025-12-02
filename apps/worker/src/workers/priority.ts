import { Worker } from "bullmq";
import { queues, queuesName, redisBullmqClient } from "@trubo/bullmq";

new Worker(queuesName.high, async (job) => {
  console.log("[worker:priority] forward", { from: "high", id: job.id });
  await queues.send.add("send-mail", { ...job.data, originalId: String(job.id) }, { jobId: `fwd-${job.id}` });
}, { connection: redisBullmqClient })
.on("failed", (job, err) => {
  console.log("[worker:priority] failed", { from: "high", id: job?.id, error: err?.message });
});

new Worker(queuesName.medium, async (job) => {
  console.log("[worker:priority] forward", { from: "medium", id: job.id });
  await queues.send.add("send-mail", { ...job.data, originalId: String(job.id) }, { jobId: `fwd-${job.id}` });
}, { connection: redisBullmqClient })
.on("failed", (job, err) => {
  console.log("[worker:priority] failed", { from: "medium", id: job?.id, error: err?.message });
});

new Worker(queuesName.low, async (job) => {
  console.log("[worker:priority] forward", { from: "low", id: job.id });
  await queues.send.add("send-mail", { ...job.data, originalId: String(job.id) }, { jobId: `fwd-${job.id}` });
}, { connection: redisBullmqClient })
.on("failed", (job, err) => {
  console.log("[worker:priority] failed", { from: "low", id: job?.id, error: err?.message });
});
