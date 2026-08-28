import { Router } from "express";
import { param } from "express-validator";
import { getTrendsHandler, getLatestHandler } from "../controllers/Trendscontroller.js";

const router = Router();
const uuid = (n) => param(n).isUUID(4).withMessage(`${n} must be a UUID`);

// GET /api/patients/:patientId/trends?tests=hgb,hba1c&limit=6
router.get("/patients/:patientId/trends", [uuid("patientId")], getTrendsHandler);

// GET /api/patients/:patientId/latest?tests=hgb,hba1c
router.get("/patients/:patientId/latest", [uuid("patientId")], getLatestHandler);

export default router;