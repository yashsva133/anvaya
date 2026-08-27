/**
 * src/controllers/patientController.js
 */

import { validationResult } from "express-validator";
import { getPatientById, updatePatientPreferences } from "../models/Patientmodel.js";

// GET /api/patients/:patientId
export async function getPatientHandler(req, res) {
  try {
    const patient = await getPatientById(req.params.patientId);
    return res.status(200).json({ success: true, data: patient });
  } catch (err) {
    if (err.code === "PGRST116") return res.status(404).json({ success: false, message: "Patient not found." });
    return res.status(500).json({ success: false, message: err.message });
  }
}

// PATCH /api/patients/:patientId/preferences
// Syncs localStorage AppSettings to the DB (cross-device continuity)
export async function updatePreferencesHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const updated = await updatePatientPreferences(req.params.patientId, req.body);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, message: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
}