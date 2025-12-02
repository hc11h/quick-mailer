import { z } from "zod";
import { queues } from "../queues.js";
import { getEnv } from "@trubo/env";
import { issueAuthCode, verifyAuthCode, createUser, getUserByEmail, setUserPassword, hashPassword, setUserPasswordHash } from "@trubo/db";

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
  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, name, password } = parsed.data;
  const existing = await getUserByEmail(email.toLowerCase());
  if (existing) return { ok: false, status: 409, error: "already_registered" } as const;
  const subject = "Your signup verification code";
  const pendingPasswordHash = hashPassword(password);
  const codeData = await issueAuthCode(email.toLowerCase(), "register", { pendingName: name, pendingPasswordHash });
  const text = `Your code is ${codeData.code}. It expires in 10 minutes.`;
  const payload = buildMailPayload(email, subject, text);
  const job = await queues.high.add("send-mail", payload);
  return { ok: true, status: 202, jobId: job.id } as const;
}

export async function registerVerify(body: unknown) {
  const parsed = RegisterVerifySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, code } = parsed.data;
  const r = await verifyAuthCode(email.toLowerCase(), "register", code);
  if (!r.ok) return { ok: false, status: 400, error: r.error } as const;
  // Create user if missing
  const user = await getUserByEmail(email.toLowerCase());
  if (!user) {
    await createUser(email.toLowerCase(), (r.doc as any)?.pendingName, undefined);
    if ((r.doc as any)?.pendingPasswordHash) {
      await setUserPasswordHash(email.toLowerCase(), (r.doc as any)?.pendingPasswordHash);
    }
  }
  return { ok: true, status: 200 } as const;
}

export async function loginRequest(body: unknown) {
  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email } = parsed.data;
  const existing = await getUserByEmail(email.toLowerCase());
  if (!existing) return { ok: false, status: 404, error: "not_registered" } as const;
  const subject = "Your login code";
  const codeData = await issueAuthCode(email.toLowerCase(), "login");
  const text = `Your code is ${codeData.code}. It expires in 10 minutes.`;
  const payload = buildMailPayload(email, subject, text);
  const job = await queues.high.add("send-mail", payload);
  return { ok: true, status: 202, jobId: job.id } as const;
}

export async function loginVerify(body: unknown) {
  const parsed = LoginVerifySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, code } = parsed.data;
  const r = await verifyAuthCode(email.toLowerCase(), "login", code);
  if (!r.ok) return { ok: false, status: 400, error: r.error } as const;
  const secret = getEnv().AUTH_SECRET;
  const token = Buffer.from(`${email}:${Date.now()}:${secret}`).toString("base64url");
  return { ok: true, status: 200, token } as const;
}

export async function forgotRequest(body: unknown) {
  const parsed = ForgotRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email } = parsed.data;
  const existing = await getUserByEmail(email.toLowerCase());
  if (!existing) return { ok: false, status: 404, error: "not_registered" } as const;
  const subject = "Your password reset code";
  const codeData = await issueAuthCode(email.toLowerCase(), "forgot");
  const text = `Your code is ${codeData.code}. It expires in 10 minutes.`;
  const payload = buildMailPayload(email, subject, text);
  const job = await queues.high.add("send-mail", payload);
  return { ok: true, status: 202, jobId: job.id } as const;
}

export async function forgotVerify(body: unknown) {
  const parsed = ForgotVerifySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "validation_error", details: parsed.error.flatten() } as const;
  const { email, code, newPassword } = parsed.data;
  const r = await verifyAuthCode(email.toLowerCase(), "forgot", code);
  if (!r.ok) return { ok: false, status: 400, error: r.error } as const;
  await setUserPassword(email.toLowerCase(), newPassword);
  return { ok: true, status: 200 } as const;
}
