# RabPDF

RabPDF is a private, offline Windows desktop toolbox for common PDF operations. Version 1.2 introduces a quieter minimal blue interface and a hand-painted Ghibli-style animated rabbit mascot.

Created by **[Nishan Chettri](https://nishanchettri.com) + ChatGPT 5.6 Sol Light**.

## Download

The ready-to-run Windows application is in [`release/RabPDF.exe`](release/RabPDF.exe). It is self-contained and does not require Python, Ghostscript, or supporting packages.

Windows may show an unknown-publisher warning because the executable is not commercially code-signed.

## Tools

- Merge, split, extract, remove, and rotate pages
- Built-in lossless and image-based PDF compression
- AES-256 password protection and authorized unlocking
- Images to PDF and PDF pages to PNG/JPG
- Searchable-text and embedded-image extraction
- Text watermarks and page numbers
- PDF metadata editing
- Web links to QR codes, saved as PNG images with selectable sizes and borders

## Android preview

The Android source is in [`mobile/`](mobile/README.md). It implements all 16
tools with local processing. Preview APK and signed App Bundle files are in
[`release/android/`](release/android/). Test on real devices before publishing.
The preview includes a 24-hour trial and the planned one-time US$0.99 unlock
screen; checkout is disabled until payment details and Play Billing are configured.
See [`mobile/PLAY_STORE_GUIDE.md`](mobile/PLAY_STORE_GUIDE.md) for publication.

## Run the desktop app from source

Requirements for developers:

- Windows 10 or 11
- Python 3.11 or newer

```powershell
py -3 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python src\rabpdf.py
```

Alternatively, double-click `scripts/run_dev.bat`.

## Build the EXE

The easiest method is to double-click:

```text
scripts\build_exe.bat
```

The script creates an isolated `.venv`, installs the development dependencies, runs the tests, and builds:

```text
dist\RabPDF.exe
```

Equivalent manual commands:

```powershell
py -3 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt -r requirements-build.txt
.venv\Scripts\python -m unittest discover -s tests -v
.venv\Scripts\pyinstaller --noconfirm --clean RabPDF.spec
```

The build machine needs Python and Internet access for dependency installation. People who receive the resulting `RabPDF.exe` need neither.

## GitHub Actions build

Every push and pull request runs tests and builds a Windows executable. Open the workflow run on GitHub and download the `RabPDF-Windows` artifact.

## Test

```powershell
.venv\Scripts\python -m unittest discover -s tests -v
```

The tests create disposable PDFs and verify page operations, encryption, rendering, compression, extraction, overlays, and metadata.

## Project layout

```text
src/                  Application source
assets/               Rabbit animation and Windows icons
tests/                Automated PDF tests
scripts/              Windows development and build helpers
.github/workflows/     Automated GitHub build
release/               Current portable executable
RabPDF.spec            PyInstaller build definition
```

## Limitations

- Text extraction is not OCR. Image-only scans require an OCR engine.
- Built-in compression may be less aggressive than specialist commercial tools for some scans.
- Unknown PDF passwords cannot be recovered.
- Keep the original PDF until the processed output has been checked.

## License

The code is available under the MIT License. The rabbit artwork is included for use with RabPDF; confirm that you own or have redistribution rights to the original artwork before publishing this repository publicly.
