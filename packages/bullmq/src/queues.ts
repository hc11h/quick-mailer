import { Queue } from "bullmq";
import type { JobsOptions } from "bullmq";
import { redisBullmqClient } from "./redis.js";
import { queuesName } from "./constants.js";

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000
  },
  removeOnComplete: true,
  removeOnFail: false
};

export const queues = {
  high: new Queue(queuesName.high, { connection: redisBullmqClient, defaultJobOptions }),
  medium: new Queue(queuesName.medium, { connection: redisBullmqClient, defaultJobOptions }),
  low: new Queue(queuesName.low, { connection: redisBullmqClient, defaultJobOptions }),
  send: new Queue(queuesName.send, { connection: redisBullmqClient, defaultJobOptions })
};

export { queuesName };
