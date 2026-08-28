/**
 * src/server.js — entry point.
 * Checks DB connection before binding the port.
 */

import "dotenv/config";
import app from "./app.js";
import { checkDbConnection } from "./config/supabase.js";

const PORT = process.env.PORT ?? 5000;

const dbOk = await checkDbConnection();
if (!dbOk) {
  console.error("❌  Cannot reach Supabase. Check your env keys. Exiting.");
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(` Rxanvaya backend  →  http://localhost:${PORT}`);
  console.log(`    ENV : ${process.env.NODE_ENV ?? "development"}`);
  console.log(`    DB  : ${process.env.SUPABASE_URL ?? "https://juszolscuqbienqcnmub.supabase.co"}\n`);
});