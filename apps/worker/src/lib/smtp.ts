import nodemailer from "nodemailer";
import type { MailPayloadType, AttachmentType } from "@trubo/utils";
import { getEnv } from "@trubo/env";

export async function sendViaGmail(data: MailPayloadType) {
  const user = (data as any).smtpUser ?? getEnv().GMAIL_USER;
  const pass = (data as any).smtpAppPassword ?? getEnv().GMAIL_APP_PASSWORD;
  const from = (data as any).smtpFrom ?? getEnv().GMAIL_FROM ?? user;
  if (!user || !pass) throw new Error("Missing Gmail SMTP credentials");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass }
  });
  const info = await transporter.sendMail({
    from,
    to: data.to,
    subject: data.subject,
    ...(data.html ? { html: data.html } : { text: data.text ?? "" }),
    attachments: (data.attachments ?? []).map((a: AttachmentType) => ({ filename: a.name, content: a.data, contentType: a.type }))
  });
  return { id: info.messageId };
}
