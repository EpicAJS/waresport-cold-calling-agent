import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// Connect lazily so importing this module during `next build` doesn't require a database.
const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL ?? "", {
    prepare: false,
    max: process.env.VERCEL ? 1 : 10,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export * from "./schema";
