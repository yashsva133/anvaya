# RxAnvaya Sample Clinical Test Reports

This directory contains anonymized sample laboratory reports for testing and validating the **RxAnvaya** ingestion, PaddleOCR, and AI analysis pipelines.

## Files

| File | Type | Description | Primary Biomarkers |
|------|------|-------------|--------------------|
| [`cbc-report-format.pdf`](cbc-report-format.pdf) | PDF Document | Standard Complete Blood Count (CBC) diagnostic report in multi-column layout. | Hemoglobin, RBC, WBC, Platelets, MCV, MCH, MCHC |
| [`report1.png`](report1.png) | Image (PNG) | Scanned clinical lab slip with standard printed layout. | Hematology & basic metabolic markers |
| [`report3.pdf`](report3.pdf) | PDF Document | Multi-page clinical laboratory pathology panel. | Differential Leukocyte Count (DLC), ESR, Hematocrit |
| [`sample-lab-results.csv`](sample-lab-results.csv) | CSV Data | Structured CSV export format for testing instant tabular ingestion. | Parameter name, value, unit, reference range |

## Usage

### Testing via Web Interface
1. Start the development server: `npm run dev`
2. Navigate to [`/upload`](http://localhost:3000/upload) or [`/scan`](http://localhost:3000/scan)
3. Upload any of the sample files above to test extraction, translation, and clinical insight generation.

### Testing OCR Directly via CLI
```bash
python lab_ocr_paddleocr.py --image samples/report1.png --out samples/extracted.csv
```
