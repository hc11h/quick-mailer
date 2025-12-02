import { Schema } from "mongoose";

export const JobSchema = new Schema({
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
