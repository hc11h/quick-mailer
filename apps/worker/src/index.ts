import { loadEnv } from "@trubo/env";

await loadEnv();

await import("./workers/priority.js");
await import("./workers/send.js");
