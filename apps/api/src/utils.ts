import { z } from "zod";

export const MailPayload = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  body: z.string().min(1),
  providerKey: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  smtpUser: z.string().optional(),
  smtpAppPassword: z.string().optional(),
  smtpFrom: z.string().optional(),
});

export const BatchMailPayload = z.array(MailPayload).min(1);
export type MailPayload = z.infer<typeof MailPayload>;
