/**
 * src/middleware/validateUUID.js
 *
 * Factory that returns a middleware which validates a named route param
 * as a UUIDv4. Returns 400 early so controllers never receive garbage IDs.
 *
 * Usage in a route file:
 *   import { validateUUID } from "../middleware/validateUUID.js";
 *   router.get("/:reportId", validateUUID("reportId"), handler);
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value || !UUID_V4_REGEX.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName}: must be a valid UUIDv4.`,
      });
    }
    next();
  };
}