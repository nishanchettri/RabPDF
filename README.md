# RabPDF

RabPDF is a private, offline Windows desktop toolbox for common PDF operations. Version 1.2 introduces a quieter minimal blue interface and a hand-painted Ghibli-style animated rabbit mascot.

Created by **[Nishan Chettri](https://nishanchettri.com) + ChatGPT**.

## Download

The ready-to-run Windows application is in [`release/RabPDF.exe`](release/RabPDF.exe). It is self-contained and does not require Python, Ghostscript, or supporting packages.

Windows may show an unknown-publisher warning because the executable is not commercially code-signed.

Version 1.4.1 refines navigation with chevron icons, clearer selection states,
single/batch controls, mouse-wheel scrolling, and a content-sized About window.
Android 0.3.1 includes matching navigation and larger touch targets.

For faster startup, use `release/RabPDF-FastStart.zip`: extract the entire folder
and run `RabPDF/RabPDF.exe`. Keep its `_internal` folder beside the EXE, and pin
that EXE to the taskbar. Unlike the single-file build, it does not extract the
bundled runtime at each launch. Antivirus scanning can still affect startup.

## Tools

Version 1.4 adds collapsible PDF/Image menus, single/batch processing, image
conversion (PNG/JPG/BMP/TIFF/GIF), target-size image compression, and offline
AI image super-resolution. QR remains in the header only. PDF compression
presets are unchanged; Estimate size runs a temporary preview without saving.
Repeated Windows launches restore the existing app window. Replace the old
EXE at the path used by your pinned shortcut, or unpin and pin the new EXE.

The bundled 240 KB ESPCN model reconstructs the same image, not a generative
redraw. AI supports native 3x or 2x from the 3x result; Lanczos is also available.
No AI model can guarantee exact recovery of detail absent from the input.
See mobile/README.md for format, size, and memory limits shared by both apps.

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
All tools are permanently free. There is no trial, payment, or subscription.
Optional home-screen AdMob banners support Android development; see
[`Ad setup`](mobile/ADS_SETUP.md). Desktop remains ad-free.
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

To build the faster-starting folder edition instead:

```powershell
$env:RABPDF_FAST_START = "1"
.venv\Scripts\pyinstaller --noconfirm RabPDF.spec
```

Distribute all of `dist/RabPDF/`, not just its EXE. Unset `RABPDF_FAST_START`
to return to the single-file build.

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
