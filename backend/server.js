/**
 * src/server.js
 *
 * Entry point — imports app and binds the HTTP server to a port.
 * Kept separate from app.js so tests can import app without side effects.
 */

import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT ?? 5000;

app.listen(PORT, () => {
  console.log(` Rxanvaya backend running on http://localhost:${PORT}`);
  console.log(`   ENV  : ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   DB   : ${process.env.SUPABASE_URL}`);
});