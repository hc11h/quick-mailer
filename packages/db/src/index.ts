import mongoose, { Schema, model } from "mongoose";
import { getEnv } from "@trubo/env";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";

let connected = false;
export async function connectMongo() {
  if (connected) return;
  if (!getEnv().MONGODB_URI) return;
  try {
    await mongoose.connect(getEnv().MONGODB_URI as string);
    connected = true;
  } catch {}
}

export function isMongoConnected() {
  return connected;
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

const AuthCodeSchema = new Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  lastRequestedAt: { type: Date, default: () => new Date() },
  pendingPasswordHash: { type: String },
  pendingName: { type: String },
}, { timestamps: true });
AuthCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
export const AuthCodeModel = model("AuthCode", AuthCodeSchema);

export async function issueAuthCode(email: string, purpose: "register" | "login" | "forgot", opts?: { pendingPasswordHash?: string, pendingName?: string }) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = createHash("sha256").update(code).digest("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await AuthCodeModel.updateOne(
    { email, purpose },
    { $set: { email, purpose, codeHash: hash, expiresAt: expires, verifiedAt: null, attempts: 0, lastRequestedAt: new Date(), pendingPasswordHash: opts?.pendingPasswordHash, pendingName: opts?.pendingName } },
    { upsert: true }
  );
  return { email, purpose, code };
}

export async function verifyAuthCode(email: string, purpose: "register" | "login" | "forgot", code: string) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  const doc = await AuthCodeModel.findOne({ email, purpose }).lean();
  if (!doc) return { ok: false, error: "not_found" as const };
  if (doc.verifiedAt) return { ok: true, verified: true as const, doc };
  if (new Date(doc.expiresAt).getTime() < Date.now()) return { ok: false, error: "expired" as const };
  const hash = createHash("sha256").update(code).digest("hex");
  const match = hash === String(doc.codeHash);
  const attempts = Math.min(Number(doc.attempts ?? 0) + 1, 10);
  if (!match) {
    await AuthCodeModel.updateOne({ email, purpose }, { $set: { attempts } });
    return { ok: false, error: "invalid_code" as const };
  }
  await AuthCodeModel.updateOne({ email, purpose }, { $set: { verifiedAt: new Date(), attempts } });
  return { ok: true, verified: true as const, doc };
}

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String },
  passwordHash: { type: String },
  verifiedAt: { type: Date },
}, { timestamps: true });
UserSchema.index({ email: 1 }, { unique: true });
export const UserModel = model("User", UserSchema);

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64);
  const hash = buf.toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const [algo, salt, hex] = String(stored).split(":");
    if (algo !== "scrypt" || !salt || !hex) return false;
    const buf = scryptSync(password, salt, 64);
    const h = Buffer.from(hex, "hex");
    return timingSafeEqual(buf, h);
  } catch {
    return false;
  }
}

export async function getUserByEmail(email: string) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  return await UserModel.findOne({ email }).lean();
}

export async function createUser(email: string, name: string | undefined, password: string | undefined) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  const existing = await UserModel.findOne({ email }).lean();
  if (existing) return existing;
  const passwordHash = password ? hashPassword(password) : undefined;
  const doc = await UserModel.create({ email, name, passwordHash, verifiedAt: new Date() });
  return doc.toObject();
}

export async function setUserPassword(email: string, password: string) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  const passwordHash = hashPassword(password);
  await UserModel.updateOne({ email }, { $set: { passwordHash } });
}

export async function setUserPasswordHash(email: string, passwordHash: string) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  await UserModel.updateOne({ email }, { $set: { passwordHash } });
}

export async function setUserVerified(email: string) {
  await connectMongo();
  if (!connected) throw new Error("mongo_unavailable");
  await UserModel.updateOne({ email }, { $set: { verifiedAt: new Date() } });
}
