/**
 * src/middleware/errorHandler.js
 *
 * Global Express error handler — must have 4 params so Express recognises it.
 * Registered LAST in app.js, after all routes.
 *
 * Why separate middleware?
 * Without this, every controller would need its own try/catch shape.
 * With it, controllers can also just call next(err) and land here.
 */

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? "Internal Server Error";

  // Don't leak stack traces in production
  const detail =
    process.env.NODE_ENV === "production" ? undefined : err.stack;

  console.error(`[ERROR] ${req.method} ${req.originalUrl} — ${message}`);

  res.status(status).json({
    success: false,
    message,
    ...(detail && { detail }),
  });
}