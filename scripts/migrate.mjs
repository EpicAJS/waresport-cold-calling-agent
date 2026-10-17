import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) process.loadEnvFile(f);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}


// libpq-only URL options (e.g. Neon's channel_binding) are sent to the server as settings by postgres.js and rejected.
function pgUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}

const sql = postgres(pgUrl(process.env.DATABASE_URL), { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
await sql.end();
console.log("Database migrations applied.");
