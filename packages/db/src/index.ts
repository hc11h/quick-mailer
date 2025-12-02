import mongoose, { Schema, model } from "mongoose";
import { getEnv } from "@trubo/env";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";

let connected = false;
let connecting: Promise<typeof mongoose> | null = null;
export async function connectMongo() {
  if (connected || mongoose.connection.readyState === 1) { connected = true; return; }
  const uri = getEnv().MONGODB_URI as string | undefined;
  if (!uri) return;
  if (connecting) { await connecting; connected = true; return; }
  try {
    connecting = mongoose.connect(uri).then((m) => { connected = true; return m; }).finally(() => { connecting = null; });
    await connecting;
  } catch {}
}

export function isMongoConnected() {
  return connected || mongoose.connection.readyState === 1;
}

const JobSchema = new Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  name: { type: String },
  priority: { type: String },
  providerKeyUsed: { type: Boolean, default: false },
  payload: { type: Schema.Types.Mixed },
  status: { type: String },
  result: { type: Schema.Types.Mixed },
  error: { type: Schema.Types.Mixed },
  events: [{ status: String, at: { type: Date, default: () => new Date() }, result: Schema.Types.Mixed, error: Schema.Types.Mixed }],
}, { timestamps: true });
JobSchema.index({ status: 1, updatedAt: -1 });
JobSchema.index({ priority: 1, updatedAt: -1 });
JobSchema.index({ createdAt: -1 });

export const JobModel = model("Job", JobSchema);

export async function logJobEnqueue(jobId: string, payload: any) {
  await connectMongo();
  if (!connected) return;
  const { providerKey, smtpUser, smtpAppPassword, smtpFrom, ...safePayload } = payload ?? {};
  await JobModel.updateOne({ jobId }, {
    $setOnInsert: { jobId },
    $set: {
      name: payload?.subject ?? "send-mail",
      priority: payload?.priority,
      providerKeyUsed: !!providerKey,
      payload: safePayload,
    }
  , $push: { events: { status: "enqueued", at: new Date() } }
  }, { upsert: true });
}

export async function logJobStatus(jobId: string, status: string, result: any, error: any) {
  await connectMongo();
  if (!connected) return;
  await JobModel.updateOne({ jobId }, { $set: { status, result, error }, $push: { events: { status, result, error, at: new Date() } } }, { upsert: true });
}
export { AuthCodeModel, UserModel } from "./models/auth/index.js";
