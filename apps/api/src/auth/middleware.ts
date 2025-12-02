import type express from "express";
import { getEnv } from "@trubo/env";
import { connectMongo } from "@trubo/db";
import { UserModel } from "@trubo/db";

function decodeToken(t?: string) {
  if (!t) return null;
  try {
    const raw = Buffer.from(t, "base64url").toString("utf8");
    const [email, ts, secret] = raw.split(":");
    if (!email || !ts || !secret) return null;
    if (secret !== getEnv().AUTH_SECRET) return null;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return { email };
  } catch {
    return null;
  }
}

export async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const h = String(req.headers.authorization ?? "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    const d = decodeToken(token);
    if (!d) return res.status(401).json({ ok: false, error: "unauthorized" });
    (res.locals as any).user = { email: d.email };
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const h = String(req.headers.authorization ?? "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    const d = decodeToken(token);
    if (!d) return res.status(401).json({ ok: false, error: "unauthorized" });
    await connectMongo();
    const user = await UserModel.findOne({ email: d.email }).lean();
    if (!user || !user.isAdmin) return res.status(403).json({ ok: false, error: "forbidden" });
    (res.locals as any).user = { email: d.email };
    next();
  } catch (err) {
    next(err);
  }
}
