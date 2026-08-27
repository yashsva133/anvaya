/**
 * src/middleware/rateLimiter.js
 *
 * Two limiters:
 *  - `globalLimiter`  — applied to every route (generous window)
 *  - `reportLimiter`  — stricter, applied only to POST /api/reports
 *    to prevent someone from hammering the OCR/AI pipeline
 */

import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

export const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,                   // max 20 report submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many report submissions. Please wait before trying again.",
  },
});