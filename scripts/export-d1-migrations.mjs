#!/usr/bin/env node
/**
 * Writes the academy schema migrations as plain .sql files for Wrangler:
 *   node scripts/export-d1-migrations.mjs
 *   npx wrangler d1 migrations apply <DB_NAME> --remote
 * (The app also applies the same migrations itself on first connection.)
 */
import { mkdirSync, writeFileSync } from "node:fs";

const files = ["0001_init", "0002_academy_structure"];
mkdirSync("migrations/d1", { recursive: true });
for (const name of files) {
  const mod = await import(`../src/academy/db/migrations/${name}.ts`);
  writeFileSync(`migrations/d1/${name}.sql`, mod.default.trim() + "\n");
  console.log(`migrations/d1/${name}.sql`);
}
