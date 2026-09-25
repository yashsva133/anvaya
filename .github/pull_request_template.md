## Description

Please include a summary of the change, relevant context, and which issue it resolves.

Fixes #(issue)

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 📝 Documentation update
- [ ] 🎨 UI / UX refinement
- [ ] ⚡ Performance optimization
- [ ] 🛡️ Clinical safety or guardrails improvement
- [ ] 🧪 Test suite additions

## Clinical Safety Checklist

For PRs touching report parsing, OCR, medical definitions, or AI inference:
- [ ] No hardcoded clinical data or fabricated values have been added.
- [ ] Medical terms & references cite trusted clinical evidence (MedlinePlus/CDC/ICMR).
- [ ] Language translations preserve protected medical biomarker tokens.
- [ ] Sensitive patient data (PHI) is properly anonymized.

## Verification Checklist

- [ ] `npm run typecheck` passes with 0 errors.
- [ ] `npm run lint` passes with 0 errors.
- [ ] `npm test` passes with all tests green.
- [ ] `npm run build` succeeds locally.
- [ ] UI tested on both desktop and mobile viewports.
