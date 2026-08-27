/**
 * src/middleware/requestLogger.js
 *
 * Wraps morgan with a format that differs between dev and prod.
 * dev  → coloured, concise
 * prod → combined (Apache-style) — better for log aggregators
 */

import morgan from "morgan";

const format = process.env.NODE_ENV === "production" ? "combined" : "dev";

export const requestLogger = morgan(format);