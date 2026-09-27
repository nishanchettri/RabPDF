# Contributing to RabPDF

Thank you for improving RabPDF.

## Workflow

1. Fork the repository and create a focused branch.
2. Create a Python virtual environment and install both requirements files.
3. Keep document operations local and offline unless a feature is explicitly designed otherwise.
4. Add or update tests for behavioral changes.
5. Run the complete test suite before opening a pull request.
6. Explain the user-visible behavior, limitations, and test evidence in the pull request.

## Engineering rules

- Never overwrite an input PDF by default.
- Treat malformed and encrypted PDFs as untrusted input.
- Do not claim that text extraction is OCR.
- Preserve page geometry and existing metadata unless the selected tool intentionally changes them.
- Keep long-running operations off the Tkinter UI thread.
- Avoid adding network calls, telemetry, accounts, or uploads to the core desktop application.
- New dependencies must have a clear benefit and a license compatible with redistribution.

## Testing

```powershell
.venv\Scripts\python -m unittest discover -s tests -v
```

For changes affecting layout or overlays, render representative output pages and inspect them visually.

## Credits

Original application: Nishan Chettri + ChatGPT. Contributors are credited through Git history and may add their name to `CONTRIBUTORS.md` in the same pull request.
