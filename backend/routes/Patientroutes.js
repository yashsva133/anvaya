import { Router } from "express";
import { param, body } from "express-validator";
import { getPatientHandler, updatePreferencesHandler } from "../controllers/Patientcontroller.js";

const router = Router();
const uuid = (n) => param(n).isUUID(4).withMessage(`${n} must be a UUID`);

router.get("/patients/:patientId", [uuid("patientId")], getPatientHandler);
router.patch(
  "/patients/:patientId/preferences",
  [
    uuid("patientId"),
    body("preferred_language").optional().isIn(["en", "hi", "bn"]),
    body("reading_level").optional().isIn(["standard", "simple", "very"]),
    body("voice_enabled").optional().isBoolean(),
    body("high_contrast").optional().isBoolean(),
    body("reduce_motion").optional().isBoolean(),
    body("font_scale").optional().isFloat({ min: 0, max: 2 }),
  ],
  updatePreferencesHandler
);

export default router;