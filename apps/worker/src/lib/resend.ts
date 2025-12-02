import { Resend } from "resend";
import type { CreateEmailOptions } from "resend";
import type { MailPayloadType } from "@trubo/utils";
import { env } from "@trubo/env";

function getClient() {
  const key = env.RESEND_KEY;
  if (!key) throw new Error("Missing RESEND_KEY. Set apps/worker/.env RESEND_KEY.");
  return new Resend(key);
}

export async function sendEmail(data: MailPayloadType) {
  const payload: CreateEmailOptions = {
    to: data.to,
    from: env.SENDER_MAIL ?? "no-reply@example.com",
    subject: data.subject,
    ...(data.html ? { html: data.html } : { text: (data.text ?? "") }),
  };
  const out = await getClient().emails.send(payload);
  return out;
}
