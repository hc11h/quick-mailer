import { z } from "zod";
import { queues } from "../queues.js";
import { getEnv } from "@trubo/env";
import { connectMongo, AuthCodeModel, UserModel } from "@trubo/db";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";

const RegisterRequestSchema = z.object({ email: z.string().email(), name: z.string().min(1).optional(), password: z.string().min(6) });
const RegisterVerifySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(12) });
const LoginRequestSchema = z.object({ email: z.string().email() });
const LoginVerifySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(12) });
const ForgotRequestSchema = z.object({ email: z.string().email() });
const ForgotVerifySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(12), newPassword: z.string().min(6) });

function buildMailPayload(to: string, subject: string, text: string) {
  const e = getEnv();
  const hasSmtp = !!(e.GMAIL_USER && e.GMAIL_APP_PASSWORD);
  return {
    to,
    subject,
    text,
    priority: "high",
    smtpUser: hasSmtp ? e.GMAIL_USER : undefined,
    smtpAppPassword: hasSmtp ? e.GMAIL_APP_PASSWORD : undefined,
    smtpFrom: hasSmtp ? (e.GMAIL_FROM ?? e.GMAIL_USER ?? undefined) : undefined,
    providerKey: hasSmtp ? undefined : (e.RESEND_KEY ? "resend" : undefined)
  } as any;
}

export async function registerRequest(body: unknown) {
  await connectMongo();
  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, name, password } = parsed.data;
  const existing = await UserModel.findOne({ email: email.toLowerCase() }).lean();
  if (existing) return { ok: false, status: 409, error: "already_registered" } as const;
  const subject = "Your signup verification code";
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64);
  const pendingPasswordHash = `scrypt:${salt}:${buf.toString("hex")}`;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await AuthCodeModel.updateOne(
    { email: email.toLowerCase(), purpose: "register" },
    { $set: { email: email.toLowerCase(), purpose: "register", codeHash, expiresAt, verifiedAt: null, attempts: 0, lastRequestedAt: new Date(), pendingPasswordHash, pendingName: name } },
    { upsert: true }
  );
  const text = `Your code is ${code}. It expires in 10 minutes.`;
  const payload = buildMailPayload(email, subject, text);
  const job = await queues.high.add("send-mail", payload);
  return { ok: true, status: 202, jobId: job.id } as const;
}

export async function registerVerify(body: unknown) {
  await connectMongo();
  const parsed = RegisterVerifySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, code } = parsed.data;
  const doc = await AuthCodeModel.findOne({ email: email.toLowerCase(), purpose: "register" }).lean();
  if (!doc) return { ok: false, status: 400, error: "not_found" } as const;
  if (doc.verifiedAt) return { ok: true, status: 200 } as const;
  if (new Date(doc.expiresAt).getTime() < Date.now()) return { ok: false, status: 400, error: "expired" } as const;
  const hash = createHash("sha256").update(code).digest("hex");
  const match = hash === String(doc.codeHash);
  const attempts = Math.min(Number(doc.attempts ?? 0) + 1, 10);
  if (!match) {
    await AuthCodeModel.updateOne({ email: email.toLowerCase(), purpose: "register" }, { $set: { attempts } });
    return { ok: false, status: 400, error: "invalid_code" } as const;
  }
  await AuthCodeModel.updateOne({ email: email.toLowerCase(), purpose: "register" }, { $set: { verifiedAt: new Date(), attempts } });
  const user = await UserModel.findOne({ email: email.toLowerCase() }).lean();
  if (!user) {
    const created = await UserModel.create({ email: email.toLowerCase(), name: (doc as any)?.pendingName, passwordHash: (doc as any)?.pendingPasswordHash, verifiedAt: new Date() });
    void created;
  }
  return { ok: true, status: 200 } as const;
}

export async function loginRequest(body: unknown) {
  await connectMongo();
  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email } = parsed.data;
  const existing = await UserModel.findOne({ email: email.toLowerCase() }).lean();
  if (!existing) return { ok: false, status: 404, error: "not_registered" } as const;
  const subject = "Your login code";
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await AuthCodeModel.updateOne(
    { email: email.toLowerCase(), purpose: "login" },
    { $set: { email: email.toLowerCase(), purpose: "login", codeHash, expiresAt, verifiedAt: null, attempts: 0, lastRequestedAt: new Date() } },
    { upsert: true }
  );
  const text = `Your code is ${code}. It expires in 10 minutes.`;
  const payload = buildMailPayload(email, subject, text);
  const job = await queues.high.add("send-mail", payload);
  return { ok: true, status: 202, jobId: job.id } as const;
}

export async function loginVerify(body: unknown) {
  await connectMongo();
  const parsed = LoginVerifySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, code } = parsed.data;
  const doc = await AuthCodeModel.findOne({ email: email.toLowerCase(), purpose: "login" }).lean();
  if (!doc) return { ok: false, status: 400, error: "not_found" } as const;
  if (new Date(doc.expiresAt).getTime() < Date.now()) return { ok: false, status: 400, error: "expired" } as const;
  const hash = createHash("sha256").update(code).digest("hex");
  const match = hash === String(doc.codeHash);
  const attempts = Math.min(Number(doc.attempts ?? 0) + 1, 10);
  if (!match) {
    await AuthCodeModel.updateOne({ email: email.toLowerCase(), purpose: "login" }, { $set: { attempts } });
    return { ok: false, status: 400, error: "invalid_code" } as const;
  }
  await AuthCodeModel.updateOne({ email: email.toLowerCase(), purpose: "login" }, { $set: { verifiedAt: new Date(), attempts } });
  const secret = getEnv().AUTH_SECRET;
  const token = Buffer.from(`${email}:${Date.now()}:${secret}`).toString("base64url");
  return { ok: true, status: 200, token } as const;
}

export async function forgotRequest(body: unknown) {
  await connectMongo();
  const parsed = ForgotRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email } = parsed.data;
  const existing = await UserModel.findOne({ email: email.toLowerCase() }).lean();
  if (!existing) return { ok: false, status: 404, error: "not_registered" } as const;
  const subject = "Your password reset code";
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await AuthCodeModel.updateOne(
    { email: email.toLowerCase(), purpose: "forgot" },
    { $set: { email: email.toLowerCase(), purpose: "forgot", codeHash, expiresAt, verifiedAt: null, attempts: 0, lastRequestedAt: new Date() } },
    { upsert: true }
  );
  const text = `Your code is ${code}. It expires in 10 minutes.`;
  const payload = buildMailPayload(email, subject, text);
  const job = await queues.high.add("send-mail", payload);
  return { ok: true, status: 202, jobId: job.id } as const;
}

export async function forgotVerify(body: unknown) {
  await connectMongo();
  const parsed = ForgotVerifySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, code, newPassword } = parsed.data;
  const doc = await AuthCodeModel.findOne({ email: email.toLowerCase(), purpose: "forgot" }).lean();
  if (!doc) return { ok: false, status: 400, error: "not_found" } as const;
  if (new Date(doc.expiresAt).getTime() < Date.now()) return { ok: false, status: 400, error: "expired" } as const;
  const hash = createHash("sha256").update(code).digest("hex");
  const match = hash === String(doc.codeHash);
  const attempts = Math.min(Number(doc.attempts ?? 0) + 1, 10);
  if (!match) {
    await AuthCodeModel.updateOne({ email: email.toLowerCase(), purpose: "forgot" }, { $set: { attempts } });
    return { ok: false, status: 400, error: "invalid_code" } as const;
  }
  await AuthCodeModel.updateOne({ email: email.toLowerCase(), purpose: "forgot" }, { $set: { verifiedAt: new Date(), attempts } });
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(newPassword, salt, 64);
  const passwordHash = `scrypt:${salt}:${buf.toString("hex")}`;
  await UserModel.updateOne({ email: email.toLowerCase() }, { $set: { passwordHash } });
  return { ok: true, status: 200 } as const;
}
