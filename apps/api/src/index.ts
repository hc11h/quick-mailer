import express from "express";
import cors from "cors";
import { BatchMailPayload } from "@trubo/utils";
import { queues } from "./queues.js";
import type { Job } from "bullmq"; //add
import { env, logJobEnqueue, logJobStatus, connectMongo, isMongoConnected, JobModel } from "@trubo/env";

export const app: express.Application = express();

const corsOptions = {
  origin: ["http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.get("/", (_req, res) => {
   res.status(200).json({
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
});
});


app.post("/api/v1/mail/send", async (req, res, next) => {
  try {
    const parsed = BatchMailPayload.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "validation_error", details: parsed.error.flatten() });
    }
    const payloads = parsed.data;
    let remainingDefaultKey = 5;
    const results: Array<{ index: number; jobId: string }> = [];
    const original = Array.isArray(req.body) ? req.body : [];
    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];
      const hasProviderKey = !!original[i]?.providerKey;
      if (!hasProviderKey) {
        if (remainingDefaultKey <= 0) continue;
        remainingDefaultKey -= 1;
      }
      const q = p.priority === "high" ? queues.high : p.priority === "low" ? queues.low : queues.medium;
      const job = await q.add("send-mail", p);
      process.stdout.write(`[api] enqueued ${job.id} priority=${p.priority}\n`);
      await logJobEnqueue(job.id as string, { ...p, providerKey: original[i]?.providerKey });
      results.push({ index: i, jobId: job.id as string });
    }
    return res.status(202).json({ ok: true, jobs: results });
  } catch (err) {
    next(err);
  }
});

 

app.get("/api/v1/jobs", async (req, res, next) => {
  try {
    const status = (req.query.status as string | undefined) ?? undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 200);
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const start = (page - 1) * limit;
    const end = start + Math.max(0, limit - 1);
    const types = status ? [status] : ["completed", "failed", "active", "waiting"];
    const jobs: Job[] = await queues.send.getJobs(types as any, start, end);
    const data = jobs.map((j) => ({ id: j.id, name: j.name, attemptsMade: j.attemptsMade, timestamp: j.timestamp }));
    return res.json({ ok: true, jobs: data, page, limit });
  } catch (err) {
    next(err);
  }
});

app.get("/api/v1/jobs/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  if (process.env.NODE_ENV === "test") {
    return res.end();
  }

  const idsParam = (req.query.ids as string | undefined) ?? undefined;
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  let lastStates = new Map<string, string>();

  const writeEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => writeEvent("ping", { t: Date.now() }), 15000);

  const poll = setInterval(async () => {
    try {
      const types = ["waiting", "active", "completed", "failed"] as const;
      const jobs = await queues.send.getJobs(types as any, 0, 100);
      const seen = new Set<string>();
      for (const j of jobs) {
        const id = String(j.id);
        if (ids && !ids.includes(id)) continue;
        const state = await j.getState();
        const prev = lastStates.get(id);
        if (prev !== state) {
          lastStates.set(id, state);
          const data = { jobId: id, status: state, result: j.returnvalue ?? null, error: j.failedReason ?? null };
          writeEvent("update", data);
          process.stdout.write(`[api] update ${id} status=${state}\n`);
          await logJobStatus(id, state, data.result, data.error);
        }
        seen.add(id);
      }
      if (ids && ids.length > 0) {
        await connectMongo();
        if (!isMongoConnected()) return;
        for (const id of ids) {
          if (seen.has(id)) continue;
          const doc = await JobModel.findOne({ jobId: id }).lean();
          if (!doc) continue;
          const prev = lastStates.get(id);
          const state = String(doc.status ?? "");
          if (state && prev !== state) {
            lastStates.set(id, state);
            const data = { jobId: id, status: state, result: doc.result ?? null, error: doc.error ?? null };
            writeEvent("update", data);
          }
        }
      }
    } catch (err) {
      writeEvent("error", { message: err instanceof Error ? err.message : "unknown" });
    }
  }, 3000);

  req.on("close", () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  });
});

app.get("/api/v1/jobs/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const q = queues.send;
    const job: Job | undefined = await (await import("bullmq")).Job.fromId(q, id);
    if (!job) return res.status(404).json({ ok: false, error: "not_found" });
    const state = await job.getState();
    const result = job.returnvalue ?? null;
    const failedReason = job.failedReason ?? null;
    return res.json({ ok: true, status: state, result, error: failedReason });
  } catch (err) {
    next(err);
  }
});

app.get("/api/v1/admin/jobs", async (req, res, next) => {
  try {
    await connectMongo();
    if (!isMongoConnected()) return res.json({ ok: true, data: [] });
    const status = (req.query.status as string | undefined) ?? undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const query: any = {};
    if (status) query.status = status;
    const docs = await JobModel.find(query).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return res.json({ ok: true, data: docs, page, limit });
  } catch (err) {
    next(err);
  }
});

app.get("/api/v1/admin/jobs/:id", async (req, res, next) => {
  try {
    await connectMongo();
    if (!isMongoConnected()) return res.status(503).json({ ok: false, error: "mongo_unavailable" });
    const id = req.params.id;
    const doc = await JobModel.findOne({ jobId: id }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, data: doc });
  } catch (err) {
    next(err);
  }
});

app.get("/api/v1/admin/jobs/:id/events", async (req, res, next) => {
  try {
    await connectMongo();
    if (!isMongoConnected()) return res.json({ ok: true, data: [] });
    const id = req.params.id;
    const doc = await JobModel.findOne({ jobId: id }, { events: 1, _id: 0 }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, data: doc.events ?? [] });
  } catch (err) {
    next(err);
  }
});

app.post("/api/v1/admin/jobs/:id/retry", async (req, res, next) => {
  try {
    await connectMongo();
    const id = req.params.id;
    const doc = await JobModel.findOne({ jobId: id }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "not_found" });
    const priorityParam = String((req.body?.priority ?? doc.priority ?? "medium"));
    const q = priorityParam === "high" ? queues.high : priorityParam === "low" ? queues.low : queues.medium;
    const payload = { ...(doc.payload ?? {}), originalId: id };
    const job = await q.add("send-mail", payload);
    process.stdout.write(`[api] retry ${id} as ${job.id} priority=${priorityParam}\n`);
    await logJobEnqueue(job.id as string, doc.payload);
    return res.json({ ok: true, jobId: job.id });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/v1/admin/jobs/:id", async (req, res, next) => {
  try {
    await connectMongo();
    const id = req.params.id;
    await JobModel.deleteOne({ jobId: id });
    try {
      const q = queues.send;
      const job: Job | undefined = await (await import("bullmq")).Job.fromId(q, id);
      if (job) await job.remove();
    } catch {}
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/v1/stats", async (_req, res, next) => {
  try {
    const q = queues.send;
    const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
    await connectMongo();
    let dbCounts: Record<string, number> = {};
    if (isMongoConnected()) {
      const agg = await JobModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
      for (const r of agg) dbCounts[String(r._id ?? "")] = Number(r.count ?? 0);
    }
    return res.json({ ok: true, queue: counts, db: dbCounts });
  } catch (err) {
    next(err);
  }
});

app.post("/api/v1/admin/jobs/:id/status", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status, result, error } = req.body ?? {};
    if (!id || !status) return res.status(400).json({ ok: false, error: "validation_error" });
    await logJobStatus(id, status, result ?? null, error ?? null);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Error middleware
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({ ok: false, error: "internal_error", message: msg });
});

const port = env.PORT;
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    process.stdout.write(`api listening on ${port}\n`);
  });
}
