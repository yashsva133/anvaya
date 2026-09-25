# Security Policy

## Supported Versions

We release patches and security fixes for the active major version of RxAnvaya:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

The RxAnvaya team takes the security of medical information and clinical AI processing very seriously.

If you discover a security vulnerability or sensitive data leakage (e.g. prompt injection, PII/PHI leakage, auth bypass, RLS policy hole, or insecure credential storage):

1. **Do NOT open a public GitHub issue.**
2. Send an email to the repository maintainers or use GitHub's private vulnerability reporting feature on the repository:
   - Navigate to the **Security** tab of this repository.
   - Click **Report a vulnerability**.
3. Include detailed reproduction steps, payload examples, and impact assessment.

### What to expect
- You will receive an initial response acknowledging receipt within 48 hours.
- We will work closely with you to validate and remediate the issue prior to public disclosure.
- Acknowledgment in release notes for responsible disclosure (unless you prefer anonymity).

## Guidelines for Responsible Research
- Avoid testing against production databases or services containing real patient data.
- Respect patient privacy and ABDM / HIPAA compliance requirements.
- Never download, store, or publish another individual's Protected Health Information (PHI).
