/**
 * src/app.js — Express app, all middleware and routes wired up.
 */

import express from "express";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";

import { requestLogger } from "./middleware/requestLogger.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";

import reportRoutes from "./routes/reportRoutes.js";
import trendsRoutes from "./routes/trendsRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";
import qaRoutes from "./routes/qaRoutes.js";

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS (allow Next.js dev + prod origins) ───────────────────────────────────
const allowed = (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000")
  .split(",").map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => (!origin || allowed.includes(origin) ? cb(null, true) : cb(new Error(`CORS: ${origin} not allowed`))),
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Logging + rate limiting ───────────────────────────────────────────────────
app.use(requestLogger);
app.use(globalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
// Matches the existing /api/health route in the Next.js app
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, mode: "live", database: "supabase" });
});

// ── API routes ────────────────────────────────────────────────────────────────
// All routes are prefixed with /api inside each router file
app.use("/api", patientRoutes);
app.use("/api", reportRoutes);
app.use("/api", trendsRoutes);
app.use("/api", aiRoutes);
app.use("/api", qaRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: "Route not found." }));

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

export default app;