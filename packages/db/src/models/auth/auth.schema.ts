import { Schema } from "mongoose";

export const AuthCodeSchema = new Schema({
  email: { type: String, required: true, index: true },
  purpose: { type: String, required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  lastRequestedAt: { type: Date, default: () => new Date() },
  pendingPasswordHash: { type: String },
  pendingName: { type: String },
  isAdmin: { type: Boolean, default: false },
}, { timestamps: true });
AuthCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

export const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String },
  passwordHash: { type: String },
  isAdmin: { type: Boolean, default: false },
  verifiedAt: { type: Date },
}, { timestamps: true });
UserSchema.index({ email: 1 }, { unique: true });
