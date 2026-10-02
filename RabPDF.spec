# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
import os

root = Path(SPEC).resolve().parent

a = Analysis(
    [str(root / "src" / "rabpdf.py")],
    pathex=[str(root / "src")],
    binaries=[],
    datas=[
        (str(root / "assets" / "image-super-resolution.onnx"), "."),
        (str(root / "assets" / "ONNX-ModelZoo-LICENSE.txt"), "."),
        (str(root / "assets" / "rabpdf_mascot_animated.gif"), "."),
        (str(root / "assets" / "rabpdf_logo_72.png"), "."),
        (str(root / "assets" / "rabpdf_logo_32.png"), "."),
        (str(root / "assets" / "rabpdf_icon.ico"), "."),
        (str(root / "assets" / "rabpdf_mascot_master.png"), "."),
        (str(root / "assets" / "rabpdf_logo_blink.png"), "."),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
fast_start = os.environ.get("RABPDF_FAST_START") == "1"

exe = EXE(
    pyz,
    a.scripts,
    [] if fast_start else a.binaries,
    [] if fast_start else a.datas,
    [],
    name="RabPDF",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(root / "assets" / "rabpdf_icon.ico"),
    version=str(root / "version_info.txt"),
    exclude_binaries=fast_start,
)
if fast_start:
    app = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True, name="RabPDF")
