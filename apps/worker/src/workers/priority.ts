import { Worker } from "bullmq";
import { queues, queuesName, redisBullmqClient } from "@trubo/bullmq";

new Worker(queuesName.high, async (job) => {
  await queues.send.add("send-mail", job.data);
}, { connection: redisBullmqClient, prefix: "trubo" });

new Worker(queuesName.medium, async (job) => {
  await queues.send.add("send-mail", job.data);
}, { connection: redisBullmqClient, prefix: "trubo" });

new Worker(queuesName.low, async (job) => {
  await queues.send.add("send-mail", job.data);
}, { connection: redisBullmqClient, prefix: "trubo" });