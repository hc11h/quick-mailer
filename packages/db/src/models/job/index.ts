export * from "./job.model.js";
export * from "./job.schema.js";
export * from "./job.types.js";

import { JobModel } from "./job.model.js";
import { connectMongo } from "../../client.js";

export async function logJobEnqueue(jobId: string, payload: any) {
  await connectMongo();
  const { providerKey, smtpUser, smtpAppPassword, smtpFrom, ...safePayload } = payload ?? {};
  await JobModel.updateOne({ jobId }, {
    $setOnInsert: { jobId },
    $set: {
      name: payload?.subject ?? "send-mail",
      priority: payload?.priority,
      providerKeyUsed: !!providerKey,
      payload: safePayload,
    },
    $push: { events: { status: "enqueued", at: new Date() } }
  }, { upsert: true });
}

export async function logJobStatus(jobId: string, status: string, result: any, error: any) {
  await connectMongo();
  await JobModel.updateOne({ jobId }, { $set: { status, result, error }, $push: { events: { status, result, error, at: new Date() } } }, { upsert: true });
}
