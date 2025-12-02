import type express from "express";
import { registerRequest, registerVerify, loginRequest, loginVerify, forgotRequest, forgotVerify } from "./service.js";

export async function registerRequestHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const r = await registerRequest(req.body);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error, details: (r as any).details });
    return res.status(r.status).json({ ok: true, jobId: (r as any).jobId });
  } catch (err) { next(err); }
}

export async function registerVerifyHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const r = await registerVerify(req.body);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error, details: (r as any).details });
    return res.status(r.status).json({ ok: true });
  } catch (err) { next(err); }
}

export async function loginRequestHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const r = await loginRequest(req.body);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error, details: (r as any).details });
    return res.status(r.status).json({ ok: true, jobId: (r as any).jobId });
  } catch (err) { next(err); }
}

export async function loginVerifyHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const r = await loginVerify(req.body);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error, details: (r as any).details });
    return res.status(r.status).json({ ok: true, token: (r as any).token });
  } catch (err) { next(err); }
}

export async function forgotRequestHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const r = await forgotRequest(req.body);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error, details: (r as any).details });
    return res.status(r.status).json({ ok: true, jobId: (r as any).jobId });
  } catch (err) { next(err); }
}

export async function forgotVerifyHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const r = await forgotVerify(req.body);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: r.error, details: (r as any).details });
    return res.status(r.status).json({ ok: true });
  } catch (err) { next(err); }
}
