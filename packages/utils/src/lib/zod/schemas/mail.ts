import z from "zod";

export const Priority = z.enum(["high", "medium", "low"]);

export const Attachment = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number().int().positive(),
  data: z.string()
});

export const MailPayload = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().optional(),
  priority: Priority.default("medium"),
  providerKey: z.string().optional(),
  attachments: z.array(Attachment).max(3).optional()
}).refine((v) => !!v.html || !!v.text, { message: "html or text required" });

export const BatchMailPayload = z.array(MailPayload).min(1);

export type PriorityType = z.infer<typeof Priority>;
export type AttachmentType = z.infer<typeof Attachment>;
export type MailPayloadType = z.infer<typeof MailPayload>;
