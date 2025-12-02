import mongoose from "mongoose";
import { getEnv } from "@trubo/env";

let connected = false;
let connecting: Promise<typeof mongoose> | null = null;

export async function connectMongo() {
  if (connected || mongoose.connection.readyState === 1) { connected = true; return; }
  const uri = getEnv().MONGODB_URI as string | undefined;
  if (!uri) return;
  if (connecting) { await connecting; connected = true; return; }
  try {
    connecting = mongoose.connect(uri).then((m) => { connected = true; return m; }).finally(() => { connecting = null; });
    await connecting;
  } catch {}
}

export function isMongoConnected() {
  return connected || mongoose.connection.readyState === 1;
}
