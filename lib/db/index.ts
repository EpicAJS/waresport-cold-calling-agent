import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// libpq-only URL options (e.g. Neon's channel_binding) are sent to the server as settings by postgres.js and rejected.
function pgUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}

const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// Connect lazily so importing this module during `next build` doesn't require a database.
const client =
  globalForDb.pgClient ??
  postgres(pgUrl(process.env.DATABASE_URL ?? ""), {
    prepare: false,
    max: process.env.VERCEL ? 1 : 10,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export * from "./schema";
