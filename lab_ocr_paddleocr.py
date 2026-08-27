"""
lab_ocr_paddleocr.py
---------------------------------------------------------------
Local, offline lab-report OCR pipeline using PaddleOCR.
Mirrors the clinical pipeline: preprocess -> OCR -> spatial row
reconstruction -> parse -> validate -> filter to whitelist -> CSV export
(only essential test values, PII / noise lines dropped automatically).

Accepts a single image OR a multi-page PDF (auto-detected by
extension) — PDF pages are converted to images internally and all
pages are merged into one output CSV.

USAGE:
    python lab_ocr_paddleocr.py --image report1.png --out results.csv
    python lab_ocr_paddleocr.py --image report1.png --out results.csv --gpu
    python lab_ocr_paddleocr.py --image report.pdf --out results.csv

Requires:
    pip install paddlepaddle paddleocr opencv-python numpy python-dateutil
    # for PDF input:
    pip install pdf2image
---------------------------------------------------------------


"""

import os
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PADDLE_DISABLE_MKLDNN"] = "1"
import sys
import re
import csv
import datetime
import argparse
import difflib
import cv2
import numpy as np
import paddle
from paddleocr import PaddleOCR

# Ensure Windows terminal handles UTF-8 / unicode symbols gracefully
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


# =================================================================
# 1. REFERENCE RANGES (ICMR/WHO/Standard Clinical Ranges) —
#    this doubles as the WHITELIST. Only test names matching a key
#    here (or an alias) will appear in the output CSV. PII, header
#    info, doctor names, and extraneous notes are dropped.
# =================================================================
REFERENCE_RANGES = {
    "hemoglobin":            {"display": "Hemoglobin",            "unit": "g/dL",     "low": 13.0,   "high": 17.0,   "aliases": ["hb", "haemoglobin", "hemoglobin", "hgb"]},
    "wbc count":             {"display": "WBC Count",             "unit": "/cumm",    "low": 4000,   "high": 11000,  "aliases": ["wbc", "total leucocyte count", "tlc", "total leukocyte count", "total wbc count", "leukocyte count", "leucocyte count", "total count", "total leucocytes count"]},
    "rbc count":             {"display": "RBC Count",             "unit": "mill/cumm","low": 4.5,    "high": 5.5,    "aliases": ["rbc", "total rbc count", "rbc count", "total red blood cell count", "red blood cell count", "total erythrocytes count", "erythrocytes"]},
    "platelet count":        {"display": "Platelet Count",        "unit": "lakh/cumm","low": 1.5,    "high": 4.5,    "aliases": ["platelets", "plt", "platelet count", "total platelet count", "total platelets", "platelet"]},
    "hba1c":                 {"display": "HbA1c",                 "unit": "%",        "low": 4.0,    "high": 5.6,    "aliases": ["glycated hemoglobin", "hb a1c", "glycosylated hemoglobin", "hba1c"]},
    "fasting glucose":       {"display": "Fasting Glucose",       "unit": "mg/dL",    "low": 70,     "high": 100,    "aliases": ["fbs", "fasting blood sugar", "fasting plasma glucose", "glucose - fasting", "blood sugar fasting", "glucose fasting"]},
    "post prandial glucose": {"display": "PP Glucose",            "unit": "mg/dL",    "low": 70,     "high": 140,    "aliases": ["ppbs", "post prandial blood sugar", "pp blood sugar", "glucose pp", "postprandial glucose"]},
    "random glucose":        {"display": "Random Glucose",        "unit": "mg/dL",    "low": 70,     "high": 140,    "aliases": ["rbs", "random blood sugar", "glucose random", "blood sugar random", "glucose"]},
    "tsh":                   {"display": "TSH",                   "unit": "mIU/L",    "low": 0.4,    "high": 4.0,    "aliases": ["thyroid stimulating hormone", "tsh - ultrasensitive", "tsh (ultrasensitive)", "s.tsh", "serum tsh"]},
    "t3":                    {"display": "T3",                    "unit": "ng/dL",    "low": 80,     "high": 200,    "aliases": ["triiodothyronine", "total t3", "s.t3", "serum t3"]},
    "t4":                    {"display": "T4",                    "unit": "µg/dL",    "low": 5.0,    "high": 12.0,   "aliases": ["thyroxine", "total t4", "s.t4", "serum t4"]},
    "ft3":                   {"display": "Free T3",               "unit": "pg/mL",    "low": 2.0,    "high": 4.4,    "aliases": ["free triiodothyronine", "ft3"]},
    "ft4":                   {"display": "Free T4",               "unit": "ng/dL",    "low": 0.8,    "high": 1.8,    "aliases": ["free thyroxine", "ft4"]},
    "total cholesterol":     {"display": "Total Cholesterol",      "unit": "mg/dL",    "low": 125,    "high": 200,    "aliases": ["cholesterol", "cholesterol total", "serum cholesterol", "s.cholesterol"]},
    "triglycerides":         {"display": "Triglycerides",         "unit": "mg/dL",    "low": 0,      "high": 150,    "aliases": ["tg", "serum triglycerides", "s.triglycerides"]},
    "hdl":                   {"display": "HDL",                   "unit": "mg/dL",    "low": 40,     "high": 60,     "aliases": ["hdl cholesterol", "hdl - cholesterol", "high density lipoprotein"]},
    "ldl":                   {"display": "LDL",                   "unit": "mg/dL",    "low": 0,      "high": 100,    "aliases": ["ldl cholesterol", "ldl - cholesterol", "low density lipoprotein"]},
    "vldl":                  {"display": "VLDL",                  "unit": "mg/dL",    "low": 5,      "high": 30,     "aliases": ["vldl cholesterol", "vldl - cholesterol", "very low density lipoprotein"]},
    "creatinine":            {"display": "Creatinine",            "unit": "mg/dL",    "low": 0.6,    "high": 1.3,    "aliases": ["serum creatinine", "s.creatinine", "creatinine - serum"]},
    "urea":                  {"display": "Urea",                  "unit": "mg/dL",    "low": 15,     "high": 40,     "aliases": ["blood urea", "s.urea", "serum urea", "urea - serum"]},
    "bun":                   {"display": "BUN",                   "unit": "mg/dL",    "low": 7,      "high": 20,     "aliases": ["blood urea nitrogen"]},
    "uric acid":             {"display": "Uric Acid",             "unit": "mg/dL",    "low": 3.5,    "high": 7.2,    "aliases": ["serum uric acid", "s.uric acid", "uric acid - serum"]},
    "sgot":                  {"display": "SGOT",                  "unit": "U/L",      "low": 5,      "high": 40,     "aliases": ["ast", "aspartate aminotransferase", "sgot/ast", "sgot (ast)"]},
    "sgpt":                  {"display": "SGPT",                  "unit": "U/L",      "low": 5,      "high": 40,     "aliases": ["alt", "alanine aminotransferase", "sgpt/alt", "sgpt (alt)"]},
    "alkaline phosphatase":  {"display": "Alkaline Phosphatase",  "unit": "U/L",      "low": 30,     "high": 120,    "aliases": ["alp", "alk phos", "s.alp", "serum alkaline phosphatase"]},
    "total bilirubin":       {"display": "Total Bilirubin",       "unit": "mg/dL",    "low": 0.2,    "high": 1.2,    "aliases": ["bilirubin total", "s.bilirubin total", "serum bilirubin - total", "bilirubin (total)"]},
    "direct bilirubin":      {"display": "Direct Bilirubin",      "unit": "mg/dL",    "low": 0.0,    "high": 0.3,    "aliases": ["bilirubin direct", "conjugated bilirubin", "bilirubin (direct)"]},
    "total protein":         {"display": "Total Protein",         "unit": "g/dL",     "low": 6.0,    "high": 8.3,    "aliases": ["protein total", "serum total protein", "s.protein"]},
    "albumin":               {"display": "Albumin",               "unit": "g/dL",     "low": 3.5,    "high": 5.2,    "aliases": ["serum albumin", "s.albumin"]},
    "globulin":              {"display": "Globulin",              "unit": "g/dL",     "low": 2.0,    "high": 3.5,    "aliases": ["serum globulin", "s.globulin"]},
    "vitamin d":             {"display": "Vitamin D",             "unit": "ng/mL",    "low": 30,     "high": 100,    "aliases": ["25-oh vitamin d", "vit d", "25 hydroxy vitamin d", "vitamin d (25-oh)", "vitamin d3"]},
    "vitamin b12":           {"display": "Vitamin B12",           "unit": "pg/mL",    "low": 200,    "high": 900,    "aliases": ["vit b12", "cobalamin", "cyanocobalamin"]},
    "calcium":               {"display": "Calcium",               "unit": "mg/dL",    "low": 8.5,    "high": 10.5,   "aliases": ["serum calcium", "s.calcium", "total calcium"]},
    "sodium":                {"display": "Sodium",                "unit": "mEq/L",    "low": 135,    "high": 145,    "aliases": ["serum sodium", "s.sodium", "na+"]},
    "potassium":             {"display": "Potassium",             "unit": "mEq/L",    "low": 3.5,    "high": 5.1,    "aliases": ["serum potassium", "s.potassium", "k+"]},
    "chloride":              {"display": "Chloride",              "unit": "mEq/L",    "low": 96,     "high": 106,    "aliases": ["serum chloride", "s.chloride", "cl-"]},
    "esr":                   {"display": "ESR",                   "unit": "mm/hr",    "low": 0,      "high": 20,     "aliases": ["erythrocyte sedimentation rate"]},
    "crp":                   {"display": "CRP",                   "unit": "mg/L",     "low": 0,      "high": 6.0,    "aliases": ["c-reactive protein", "c reactive protein"]},

    # Differential Count (Percentages)
    "neutrophils":           {"display": "Neutrophils",           "unit": "%",        "low": 40,     "high": 80,     "aliases": ["neutrophil", "neutrophils", "polymorphs", "segs", "segmented neutrophils"]},
    "lymphocytes":           {"display": "Lymphocytes",           "unit": "%",        "low": 20,     "high": 40,     "aliases": ["lymphocyte", "lymphocytes", "lympho"]},
    "eosinophils":           {"display": "Eosinophils",           "unit": "%",        "low": 1,      "high": 6,      "aliases": ["eosinophil", "eosinophils", "eosino", "eosinhils"]},
    "monocytes":             {"display": "Monocytes",             "unit": "%",        "low": 2,      "high": 10,     "aliases": ["monocyte", "monocytes", "mono"]},
    "basophils":             {"display": "Basophils",             "unit": "%",        "low": 0,      "high": 2,      "aliases": ["basophil", "basophils", "baso"]},

    # Absolute Differential Counts (/cumm)
    "absolute neutrophils":  {"display": "Absolute Neutrophils",  "unit": "/cumm",    "low": 2000,   "high": 7000,   "aliases": ["absolute neutrophil count", "anc", "absolute neutrophils"]},
    "absolute lymphocytes":  {"display": "Absolute Lymphocytes",  "unit": "/cumm",    "low": 1000,   "high": 3000,   "aliases": ["absolute lymphocyte count", "alc", "absolute lymphocytes"]},
    "absolute eosinophils":  {"display": "Absolute Eosinophils",  "unit": "/cumm",    "low": 20,     "high": 500,    "aliases": ["absolute eosinophil count", "aec", "absolute eosinophils"]},
    "absolute monocytes":    {"display": "Absolute Monocytes",    "unit": "/cumm",    "low": 200,    "high": 1000,   "aliases": ["absolute monocyte count", "amc", "absolute monocytes"]},
    "absolute basophils":    {"display": "Absolute Basophils",    "unit": "/cumm",    "low": 0,      "high": 100,    "aliases": ["absolute basophil count", "abc", "absolute basophils"]},

    # RBC & Platelet Indices
    "packed cell volume":    {"display": "Packed Cell Volume",   "unit": "%",        "low": 40,     "high": 50,     "aliases": ["pcv", "hematocrit", "hematocrit value, hct", "hct", "hematocrit (hct)"]},
    "mcv":                   {"display": "MCV",                  "unit": "fL",       "low": 83,     "high": 101,    "aliases": ["mean corpuscular volume", "mean corpuscular volume, mcv", "mcv"]},
    "mch":                   {"display": "MCH",                  "unit": "pg",       "low": 27,     "high": 32,     "aliases": ["mean cell haemoglobin", "mean cell haemoglobin, mch", "mean corpuscular hemoglobin", "mch", "mean cell hemoglobin"]},
    "mchc":                  {"display": "MCHC",                 "unit": "g/dL",     "low": 31.5,   "high": 34.5,   "aliases": ["mean cell haemoglobin con, mchc", "mean corpuscular hemoglobin concentration", "mchc", "mean cell haemoglobin concentration"]},
    "rdw-cv":                {"display": "RDW-CV",               "unit": "%",        "low": 11.6,   "high": 14.0,   "aliases": ["rdw-cv", "rdw cv", "red cell distribution width - cv", "rdw"]},
    "rdw-sd":                {"display": "RDW-SD",               "unit": "fL",       "low": 39.0,   "high": 46.0,   "aliases": ["rdw-sd", "rdw sd", "red cell distribution width - sd"]},
    "mpv":                   {"display": "MPV",                  "unit": "fL",       "low": 7.5,    "high": 11.5,   "aliases": ["mean platelet volume", "mpv"]},
    "pdw":                   {"display": "PDW",                  "unit": "%",        "low": 9.0,    "high": 17.0,   "aliases": ["platelet distribution width", "pdw"]},
    "pct":                   {"display": "PCT",                  "unit": "%",        "low": 0.1,    "high": 0.5,    "aliases": ["plateletcrit", "pct"]},
}

# Build flat alias lookup
ALIAS_LOOKUP = {}
for canonical, info in REFERENCE_RANGES.items():
    ALIAS_LOOKUP[canonical.lower()] = canonical
    for alias in info["aliases"]:
        ALIAS_LOOKUP[alias.lower()] = canonical

NOISE_KEYWORDS = [
    "name", "age", "sex", "gender", "phone", "mobile", "address",
    "lab id", "patient id", "date", "report id", "doctor", "referred by",
    "sample", "collected", "received", "page", "signature", "consultant",
    "clinical notes", "interpretation", "possible causes", "registered on",
    "reported on", "valid for medico", "work timings", "test description",
    "test name", "reference range", "biological ref", "method", "unit", "consultant pathologist"
]


# =================================================================
# 1b. PDF & IMAGE LOADING
# =================================================================
def load_pages(path: str, dpi: int = 300):
    """
    Returns a list of BGR numpy arrays (one per page).
    - For image files: a single-element list.
    - For PDFs: one element per page, converted via pypdfium2 or pdf2image.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".pdf":
        pages = []
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(path)
            scale = dpi / 72.0
            for page in pdf:
                pil_img = page.render(scale=scale).to_pil()
                rgb = np.array(pil_img)
                bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                pages.append(bgr)
        except ImportError:
            from pdf2image import convert_from_path
            pil_pages = convert_from_path(path, dpi=dpi)
            for pil_img in pil_pages:
                rgb = np.array(pil_img)
                bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                pages.append(bgr)

        if not pages:
            raise ValueError(f"No pages could be extracted from PDF: {path}")
        return pages

    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return [img]


# =================================================================
# 2. PREPROCESSING — Deskew & maintain 3-channel BGR image
# =================================================================
def preprocess_image(img: np.ndarray) -> np.ndarray:
    """
    Preprocesses the image for OCR while ensuring a valid 3-channel BGR format.
    PaddleOCR 3.x expects 3 channels.
    """
    if img is None:
        return img
    
    # Deskew if needed
    deskewed = _deskew(img)
    
    # Ensure 3 channels
    if len(deskewed.shape) == 2:
        deskewed = cv2.cvtColor(deskewed, cv2.COLOR_GRAY2BGR)
    elif len(deskewed.shape) == 3 and deskewed.shape[2] == 4:
        deskewed = cv2.cvtColor(deskewed, cv2.COLOR_BGRA2BGR)
        
    return deskewed


def _deskew(img: np.ndarray) -> np.ndarray:
    """Calculates deskew angle and rotates the image if skewed."""
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    if coords.size == 0:
        return img

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    elif angle > 45:
        angle = 90 - angle
    else:
        angle = -angle

    # Only apply rotation if angle is notable
    if 0.5 < abs(angle) < 45.0:
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)
    return img


# =================================================================
# 3. OCR — PaddleOCR (3.x Pipeline API)
# =================================================================
def parse_box_coords(box):
    """Parses bounding box into (xmin, ymin, xmax, ymax)."""
    b = np.array(box)
    if b.ndim == 1 and len(b) == 4:
        return float(b[0]), float(b[1]), float(b[2]), float(b[3])
    elif b.ndim == 2:
        return float(b[:, 0].min()), float(b[:, 1].min()), float(b[:, 0].max()), float(b[:, 1].max())
    return 0.0, 0.0, 0.0, 0.0


def run_paddle_ocr(img: np.ndarray, lang: str = "en", min_confidence: float = 0.6,
                   use_gpu: bool = False):
    """
    Runs PaddleOCR on the image and returns:
    1. structured_items: list of dicts with 'text', 'score', 'xmin', 'ymin', 'xmax', 'ymax', 'ymid'
    2. raw_lines: list of (text, confidence) tuples
    """
    if use_gpu or (paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0):
        device = "gpu:0"
    else:
        device = "cpu"

    ocr = PaddleOCR(
        lang=lang,
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
    )
    result = ocr.predict(input=img)

    structured_items = []
    raw_lines = []

    for res in result:
        texts = res.get("rec_texts", [])
        scores = res.get("rec_scores", [])
        boxes = res.get("rec_boxes", res.get("dt_polys", []))

        for text, score, box in zip(texts, scores, boxes):
            score = float(score)
            text_str = str(text).strip()
            raw_lines.append((text_str, score))

            if score >= min_confidence and text_str:
                xmin, ymin, xmax, ymax = parse_box_coords(box)
                structured_items.append({
                    "text": text_str,
                    "score": score,
                    "xmin": xmin,
                    "ymin": ymin,
                    "xmax": xmax,
                    "ymax": ymax,
                    "ymid": (ymin + ymax) / 2.0
                })

    return structured_items, raw_lines


# =================================================================
# 4. SPATIAL ROW RECONSTRUCTION & PARSING
# =================================================================
def group_items_into_rows(items):
    """
    Groups OCR bounding boxes that lie on the same horizontal line.
    Handles tabular multi-column lab reports.
    """
    # Filter out empty or non-text vertical line artifacts
    clean_items = []
    for it in items:
        h = it["ymax"] - it["ymin"]
        w = it["xmax"] - it["xmin"]
        if h > 2.5 * w and len(it["text"]) <= 2:
            continue
        clean_items.append(it)

    clean_items.sort(key=lambda x: (x["ymin"], x["xmin"]))

    rows = []
    for item in clean_items:
        h = item["ymax"] - item["ymin"]
        matched_row = None
        for row in rows:
            row_ymids = [x["ymid"] for x in row]
            row_heights = [x["ymax"] - x["ymin"] for x in row]
            med_ymid = float(np.median(row_ymids))
            med_h = float(np.median(row_heights))

            if abs(item["ymid"] - med_ymid) <= max(med_h * 0.45, 6.0):
                overlap = min(item["ymax"], max(x["ymax"] for x in row)) - max(item["ymin"], min(x["ymin"] for x in row))
                if overlap > 0.3 * min(h, med_h):
                    matched_row = row
                    break

        if matched_row is not None:
            matched_row.append(item)
        else:
            rows.append([item])

    rows.sort(key=lambda r: min(x["ymin"] for x in r))
    for r in rows:
        r.sort(key=lambda x: x["xmin"])
    return rows


def normalize_key(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r'[\:\-\,\(\)]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def match_whitelist(candidate_name: str):
    """Fuzzy/normalized matching against clinical test whitelist."""
    raw = candidate_name.strip()
    if not raw or len(raw) < 2:
        return None

    # Strip trailing single letter flags like ' H', ' L'
    raw_cleaned = re.sub(r'\s+[HL]$', '', raw, flags=re.IGNORECASE).strip()

    key = raw.lower()
    if key in ALIAS_LOOKUP:
        return ALIAS_LOOKUP[key]

    key_clean = raw_cleaned.lower()
    if key_clean in ALIAS_LOOKUP:
        return ALIAS_LOOKUP[key_clean]

    norm = normalize_key(raw_cleaned)
    if norm in ALIAS_LOOKUP:
        return ALIAS_LOOKUP[norm]

    # Substring match (prefer longer exact alias matches)
    candidates_matched = []
    for alias, canonical in ALIAS_LOOKUP.items():
        if len(alias) >= 3 and re.search(r'\b' + re.escape(alias) + r'\b', norm):
            candidates_matched.append((len(alias), canonical))
    if candidates_matched:
        candidates_matched.sort(reverse=True)
        return candidates_matched[0][1]

    # Fuzzy match with difflib for minor OCR typos (e.g. 'eosinhils' -> 'eosinophils')
    if len(norm) >= 5:
        best_match = None
        best_ratio = 0.0
        for alias, canonical in ALIAS_LOOKUP.items():
            if len(alias) >= 5 and abs(len(alias) - len(norm)) <= 3:
                ratio = difflib.SequenceMatcher(None, norm, alias).ratio()
                if ratio > 0.82 and ratio > best_ratio:
                    best_ratio = ratio
                    best_match = canonical
        if best_match:
            return best_match

    return None


def normalize_unit(raw_unit: str, canonical_unit: str) -> str:
    """Normalizes variations in clinical measurement units."""
    if not raw_unit:
        return canonical_unit
    u = raw_unit.strip().lower()
    if u in ["g/dl", "gm/dl", "g/100ml"]:
        return "g/dL"
    if u in ["mg/dl", "mg%"]:
        return "mg/dL"
    if u in ["/cumm", "cumm", "/ul", "cells/cumm", "cells/ul", "/mm3", "per cumm", "io", "i"]:
        return "/cumm"
    if u in ["million/cumm", "mill/cumm", "mil/cumm", "m/cumm", "10^6/ul", "10^6/cumm", "lion/cumm", "illion/cumm"]:
        return "mill/cumm"
    if u in ["lakh/cumm", "lakhs/cumm", "lac/cumm", "lacs/cumm", "10^5/cumm"]:
        return "lakh/cumm"
    if u in ["fl", "femtoliter", "femtolitres", "cu.mic"]:
        return "fL"
    if u in ["pg", "picogram"]:
        return "pg"
    if u in ["miu/l", "uiu/ml", "miu/ml", "uiu/l"]:
        return "mIU/L"
    if u == "%": return "%"
    if u == "ng/ml": return "ng/mL"
    if u == "ng/dl": return "ng/dL"
    if u == "pg/ml": return "pg/mL"
    if u in ["µg/dl", "ug/dl"]: return "µg/dL"
    if u == "meq/l": return "mEq/L"
    if u == "mmol/l": return "mmol/L"
    if u == "u/l": return "U/L"
    return raw_unit


def is_unit_compatible(detected_unit: str, canonical_unit: str) -> bool:
    """
    Returns True if detected_unit matches canonical_unit or is recognized
    as a clinically identical representation (e.g. gm/dl vs g/dL).
    """
    if not detected_unit:
        return False  # Unit is missing/unreadable

    norm_detected = normalize_unit(detected_unit, canonical_unit).strip().lower()
    norm_canonical = canonical_unit.strip().lower()

    if norm_detected == norm_canonical:
        return True

    equivalents = {
        "g/dl": ["gm/dl", "g/100ml", "g/dl"],
        "mg/dl": ["mg/dl", "mg%"],
        "/cumm": ["/cumm", "cumm", "/ul", "cells/cumm", "cells/ul", "/mm3", "per cumm", "io", "i"],
        "mill/cumm": ["million/cumm", "mill/cumm", "mil/cumm", "m/cumm", "10^6/ul", "10^6/cumm", "lion/cumm", "illion/cumm"],
        "lakh/cumm": ["lakh/cumm", "lakhs/cumm", "lac/cumm", "lacs/cumm", "10^5/cumm"],
        "fl": ["fl", "femtoliter", "femtolitres", "cu.mic"],
        "pg": ["pg", "picogram"],
        "miu/l": ["miu/l", "uiu/ml", "miu/ml", "uiu/l"],
        "µg/dl": ["µg/dl", "ug/dl"],
        "%": ["%"],
        "ng/ml": ["ng/ml"],
        "ng/dl": ["ng/dl"],
        "pg/ml": ["pg/ml"],
        "meq/l": ["meq/l"],
        "mmol/l": ["mmol/l"],
        "u/l": ["u/l"],
        "mm/hr": ["mm/hr", "mm/1st hr", "mm/1hr"],
        "mg/l": ["mg/l"],
    }

    for key, alts in equivalents.items():
        if norm_canonical == key and (norm_detected in alts or detected_unit.lower() in alts):
            return True

    return False


SECTION_HEADERS = [
    "indices",
    "differential leucocyte count",
    "differential count",
    "absolute leucocyte count",
    "haematology",
    "complete blood count",
    "test description",
    "bio. ref. interval",
    "method",
]


def is_section_header(row_text: str) -> bool:
    low = row_text.lower()
    return any(w in low for w in SECTION_HEADERS)


def parse_row(row_items, min_test_confidence: float = 0.6):
    """
    Parses a horizontally grouped row into a clinical test record with edge case rules:
    1. If test_name is unreadable (very blurred or missing) -> returns None (not added to CSV).
    2. If value is not readable -> leaves space blank ("") in CSV, status='Needs Input'.
    3. If unit is not readable -> takes hardcoded unit and reduces OCR confidence by 0.30.
    4. If unit is different from hardcoded unit -> mentions detected unit, but leaves ref_low,
       ref_high, and status blank ("").
    """
    row_text = " ".join(item["text"] for item in row_items)
    lowered = row_text.lower()

    # Drop obvious table headers / section headers
    if ("test" in lowered and ("result" in lowered or "value" in lowered)) or ("description" in lowered and "unit" in lowered):
        return None

    if is_section_header(row_text):
        return None

    # Search for test name from left to right
    for i in range(len(row_items)):
        candidate_name = row_items[i]["text"]
        candidate_conf = row_items[i]["score"]

        canonical = match_whitelist(candidate_name)
        used_indices = {i}
        test_confs = [candidate_conf]

        # Try merging adjacent token if not matched
        if not canonical and i + 1 < len(row_items):
            pair_name = candidate_name + " " + row_items[i + 1]["text"]
            canonical = match_whitelist(pair_name)
            if canonical:
                used_indices.add(i + 1)
                test_confs.append(row_items[i + 1]["score"])

        # Edge Case 1: If test_name is unreadable (very blurred or missing) -> do not add to CSV
        if not canonical:
            continue

        avg_test_conf = sum(test_confs) / len(test_confs)
        if avg_test_conf < min_test_confidence:
            continue

        ref = REFERENCE_RANGES[canonical]
        value = None
        raw_unit = None
        has_range = False
        all_confidences = list(test_confs)

        for j in range(len(row_items)):
            if j in used_indices:
                continue
            item_text = row_items[j]["text"].strip()

            # Check for reference range pattern
            if re.search(r'\d+\s*[-–to]\s*\d+|<|>|\b\d+\s*-\s*\d+', item_text):
                has_range = True

            # Check for numeric test value
            if value is None:
                if not re.search(r'[-–]|to|<|>', item_text):
                    clean_num = item_text.replace(',', '')
                    m = re.match(r'^(\d+\.?\d*)$', clean_num)
                    if m:
                        try:
                            value = float(m.group(1))
                            all_confidences.append(row_items[j]["score"])
                            continue
                        except ValueError:
                            pass

            # Check for unit
            if raw_unit is None and re.match(r'^[a-zA-Z/%µ]{1,12}(/[a-zA-Z]+)?$', item_text):
                if item_text.upper() not in ['H', 'L', 'N', 'A', 'P']:
                    raw_unit = item_text
                    all_confidences.append(row_items[j]["score"])

        base_conf = sum(all_confidences) / len(all_confidences) if all_confidences else 1.0

        # Normalize platelet count if reported in absolute /cumm (>10000)
        if canonical == "platelet count" and value is not None and value > 10000:
            value = round(value / 100000.0, 2)
            raw_unit = "lakh/cumm"

        # Edge Case 2 & 3: Unit and Value resolution
        unit_was_readable = (raw_unit is not None)

        if not unit_was_readable:
            # Edge Case 3: If unit is not readable, take from hardcoded values and reduce OCR confidence by 0.30
            unit = ref["unit"]
            final_conf = max(0.0, base_conf - 0.30)
            ref_low = ref["low"]
            ref_high = ref["high"]
            if value is not None:
                status = validate_value(value, ref["low"], ref["high"])
            else:
                # Value is also unreadable -> Edge Case 2
                status = "Needs Input"
        else:
            # Unit was detected in OCR
            normalized_u = normalize_unit(raw_unit, ref["unit"])
            is_compat = is_unit_compatible(raw_unit, ref["unit"]) or is_unit_compatible(normalized_u, ref["unit"])

            if not is_compat:
                # Edge Case 4: Unit is DIFFERENT from hardcoded unit
                # Mention detected unit in unit, but don't add ref_low, ref_high, and status
                unit = raw_unit
                ref_low = ""
                ref_high = ""
                status = ""
                final_conf = base_conf
            else:
                # Unit matches hardcoded unit
                unit = normalized_u
                ref_low = ref["low"]
                ref_high = ref["high"]
                if value is not None:
                    status = validate_value(value, ref["low"], ref["high"])
                else:
                    # Edge Case 2: Value is not readable
                    status = "Needs Input"
                final_conf = base_conf

        # Edge Case 2: If value is not readable, leave space blank ("")
        val_out = value if value is not None else ""

        # Make sure row is valid (has value, unit, range, or other context tokens)
        if value is not None or unit_was_readable or has_range or (len(row_items) > len(used_indices)):
            return {
                "test_name": ref["display"],
                "value": val_out,
                "unit": unit,
                "ref_low": ref_low,
                "ref_high": ref_high,
                "status": status,
                "ocr_confidence": round(final_conf, 3),
            }

    return None


def parse_lines_to_records(structured_items, min_test_confidence: float = 0.6):
    """Groups OCR items into rows and extracts all whitelisted test records."""
    rows = group_items_into_rows(structured_items)
    records = []
    seen_tests = set()

    for r in rows:
        rec = parse_row(r, min_test_confidence=min_test_confidence)
        if rec and rec["test_name"] not in seen_tests:
            seen_tests.add(rec["test_name"])
            records.append(rec)

    return records


# =================================================================
# 5. REPORT DATE EXTRACTION
# =================================================================
DATE_KEYWORDS = ["date", "collected", "reported", "sample date",
                  "report date", "collection date", "registered on", "reported on"]

DATE_SHAPE_PATTERN = re.compile(
    r"\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b"
    r"|\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b"
    r"|\b\d{1,2}\s*(?:st|nd|rd|th)?\s*"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-zA-Z]*"
    r"\s*,?\s*\d{2,4}\b"
    r"|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-zA-Z]*"
    r"\s+\d{1,2}\s*,?\s*\d{2,4}\b",
    re.IGNORECASE,
)


def extract_report_date(all_lines):
    """
    Extracts the printed date from OCR output across all lines.
    Returns datetime.date if found, else None.
    """
    try:
        from dateutil import parser as date_parser
    except ImportError:
        date_parser = None

    texts = [t for t, _ in all_lines]
    keyword_lines = [t for t in texts if any(k in t.lower() for k in DATE_KEYWORDS)]
    candidates = keyword_lines + texts

    for text in candidates:
        match = DATE_SHAPE_PATTERN.search(text)
        if not match:
            continue
        date_str = match.group(0)

        if date_parser is not None:
            try:
                if re.match(r"^\d{4}[/\-.]", date_str):
                    dt = date_parser.parse(date_str, yearfirst=True, dayfirst=False)
                else:
                    dt = date_parser.parse(date_str, dayfirst=True)
                if 2000 <= dt.year <= 2100:
                    return dt.date()
            except (ValueError, OverflowError):
                continue
        else:
            iso_match = re.match(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", date_str)
            dmy_match = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", date_str)
            try:
                if iso_match:
                    y, mo, d = iso_match.groups()
                    return datetime.date(int(y), int(mo), int(d))
                elif dmy_match:
                    d, mo, y = dmy_match.groups()
                    y = int(y)
                    if y < 100:
                        y += 2000
                    return datetime.date(y, int(mo), int(d))
            except ValueError:
                continue

    return None


# =================================================================
# 6. DETERMINISTIC VALIDATION RULE ENGINE
# =================================================================
def validate_value(value: float, ref_low: float, ref_high: float) -> str:
    """Deterministically labels value status based on clinical reference bounds."""
    if value < ref_low:
        return "Low"
    elif value > ref_high:
        return "High"
    return "Normal"


# =================================================================
# 7. WRITE FILTERED CSV
# =================================================================
def write_csv(records, out_path: str):
    fieldnames = ["report_date", "test_name", "value", "unit",
                  "ref_low", "ref_high", "status", "ocr_confidence"]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in records:
            writer.writerow(row)


# =================================================================
# 8. MAIN CLI
# =================================================================
def main():
    parser = argparse.ArgumentParser(description="PaddleOCR lab report -> filtered CSV")
    parser.add_argument("--image", required=True,
                        help="Path to the lab report image OR a multi-page PDF")
    parser.add_argument("--out", default="lab_results.csv", help="Output CSV path")
    parser.add_argument("--lang", default="en", help="PaddleOCR language code (en, hi, etc.)")
    parser.add_argument("--min-confidence", type=float, default=0.6,
                        help="Minimum OCR confidence to keep a line")
    parser.add_argument("--dpi", type=int, default=300,
                        help="Rendering DPI when input is a PDF (ignored for images)")
    parser.add_argument("--gpu", action="store_true",
                        help="Use GPU for OCR inference (requires paddlepaddle-gpu installed)")
    args = parser.parse_args()

    print(f"[1/6] Loading {args.image} ...")
    pages = load_pages(args.image, dpi=args.dpi)
    print(f"      -> {len(pages)} page(s) to process")

    all_records = []
    all_raw_lines = []

    for page_num, raw_img in enumerate(pages, start=1):
        print(f"[2/7] Page {page_num}/{len(pages)}: preprocessing ...")
        processed = preprocess_image(raw_img)

        print(f"[3/7] Page {page_num}/{len(pages)}: running PaddleOCR "
              f"(lang={args.lang}, gpu={args.gpu}) ...")
        structured_items, raw_lines = run_paddle_ocr(
            processed, lang=args.lang, min_confidence=args.min_confidence, use_gpu=args.gpu
        )
        print(f"      -> {len(structured_items)} bounding boxes above confidence threshold")
        all_raw_lines.extend(raw_lines)

        print(f"[4/7] Page {page_num}/{len(pages)}: parsing test/value pairs ...")
        records = parse_lines_to_records(structured_items, min_test_confidence=args.min_confidence)
        print(f"      -> {len(records)} matched known clinical parameters")

        all_records.extend(records)

    print("[5/7] Extracting report date ...")
    report_date = extract_report_date(all_raw_lines)
    if report_date is None:
        report_date = datetime.date.today()
        print(f"      -> no date found on report, using today's date: {report_date}")
    else:
        print(f"      -> found report date: {report_date}")

    for r in all_records:
        r["report_date"] = report_date.isoformat()

    print("[6/7] Applying deterministic range validation ...")
    # (applied deterministically during parsing)

    print(f"[7/7] Writing merged, filtered CSV -> {args.out}")
    write_csv(all_records, args.out)

    print(f"\nDone. {len(all_records)} total rows across {len(pages)} page(s), "
          f"dated {report_date.isoformat()}. Sample:")
    for r in all_records[:15]:
        val_display = str(r['value']) if r['value'] != "" else "<NEEDS INPUT>"
        print(f"  {r['report_date']} {r['test_name']:<22} {val_display:>14} "
              f"{r['unit']:<10} [{r['ref_low']}-{r['ref_high']}] -> {r['status']}")


if __name__ == "__main__":
    main()