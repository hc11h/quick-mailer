import { Worker } from "bullmq";
import { queuesName, redisBullmqClient } from "@trubo/bullmq";  
import { sendEmail as sendViaResend } from "../lib/resend.js";
import { sendViaGmail } from "../lib/smtp.js";
const API_BASE = (process.env.API_BASE_URL ?? "http://localhost:8080");
async function logStatus(id: string, status: string, result?: any, error?: any) {
  try {
    const f: any = (globalThis as any).fetch;
    if (!f) return;
    await f(`${API_BASE}/api/v1/admin/jobs/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, result: result ?? null, error: error ?? null }) });
  } catch {}
}


const worker = new Worker(queuesName.send, async (job) => {
  console.log("[worker:send] processing", { id: job.id, name: job.name });
  const orig = String((job.data as any)?.originalId ?? job.id);
  await logStatus(orig, "active");
  let result: any;
  const d: any = job.data as any;
  if (d.providerKey) {
    result = await sendViaResend(job.data);
  } else if (d.smtpUser || d.smtpAppPassword || process.env.GMAIL_USER) {
    result = await sendViaGmail(job.data);
  } else {
    result = await sendViaResend(job.data);
  }
  console.log("[worker:send] provider_result", { id: (result as any)?.id ?? null });
  if ((result as any)?.error) {
    throw new Error((result as any)?.error?.message ?? "provider_error");
  }
  console.log("[worker:send] processed", { id: job.id, success: true });
  await logStatus(orig, "completed", result, null);
  return result;
}, {
  connection: redisBullmqClient,
  concurrency: 20,
  limiter: { max: 200, duration: 1000 }
});
worker.on("completed", async (job) => {
  console.log("[worker:send] completed", { id: job.id });
});
worker.on("failed", async (job, err: any) => {
  const orig = String(((job as any)?.data as any)?.originalId ?? job?.id ?? "");
  console.log("[worker:send] failed", { id: job?.id, error: err?.message, stack: err?.stack, provider: err?.response?.data ?? null });
  await logStatus(orig, "failed", null, { message: err?.message, stack: err?.stack, provider: err?.response?.data ?? null });
});
