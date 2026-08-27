/**
 * src/models/patientModel.js
 *
 * Patient profile queries.
 * Schema: patients table (PHI zone), profiles table (auth layer).
 *
 * The patients table holds:
 *   - full_name, name_local_script (backs L2 {en,hi} name pattern)
 *   - date_of_birth, sex
 *   - accessibility prefs: preferred_language, reading_level, voice_enabled,
 *     high_contrast, reduce_motion, font_scale
 *     (these mirror AppSettings from src/lib/i18n.tsx for cross-device sync)
 */

import { supabaseAdmin } from "../config/supabase.js";

/**
 * Get patient profile by their UUID.
 * @param {string} patientId
 */
export async function getPatientById(patientId) {
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select(`
      id, profile_id,
      full_name, name_local_script,
      date_of_birth, sex,
      city, state,
      preferred_language, reading_level,
      voice_enabled, high_contrast, reduce_motion, font_scale,
      deleted_at
    `)
    .eq("id", patientId)
    .is("deleted_at", null)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update patient accessibility/preference settings.
 * These are the AppSettings that src/lib/i18n.tsx writes to localStorage —
 * this persists them to the DB for cross-device continuity.
 *
 * @param {string} patientId
 * @param {{
 *   preferred_language?: 'en'|'hi'|'bn',
 *   reading_level?: 'standard'|'simple'|'very',
 *   voice_enabled?: boolean,
 *   high_contrast?: boolean,
 *   reduce_motion?: boolean,
 *   font_scale?: number,
 * }} prefs
 */
export async function updatePatientPreferences(patientId, prefs) {
  const allowed = [
    "preferred_language", "reading_level", "voice_enabled",
    "high_contrast", "reduce_motion", "font_scale",
  ];
  const patch = Object.fromEntries(
    Object.entries(prefs).filter(([k]) => allowed.includes(k))
  );

  if (Object.keys(patch).length === 0) {
    throw Object.assign(new Error("No valid preference fields provided."), { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("patients")
    .update(patch)
    .eq("id", patientId)
    .is("deleted_at", null)
    .select("id, preferred_language, reading_level, voice_enabled, high_contrast, reduce_motion, font_scale")
    .single();

  if (error) throw error;
  return data;
}