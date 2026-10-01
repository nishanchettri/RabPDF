"""Export the tested desktop processing methods without importing Tkinter."""
import ast
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = ast.parse((root / "src/rabpdf.py").read_text(encoding="utf-8"))
functions = {"human_size", "parse_pages", "parse_ranges"}
methods = {"_reader", "_overlay"}
module = ast.parse("import io\nimport os\nfrom pathlib import Path\n")
for item in source.body:
    if isinstance(item, ast.FunctionDef) and item.name in functions:
        module.body.append(item)
    if isinstance(item, ast.ClassDef) and item.name == "PDFStudio":
        item.name = "PDFEngine"
        item.bases = []
        item.body = [m for m in item.body if isinstance(m, ast.FunctionDef) and
                     (m.name in methods or (m.name.startswith("do_") and
                                           m.name not in {"do_pdf_to_images", "do_qr"}))]
        module.body.append(item)
public = root / "mobile/public"
public.mkdir(parents=True, exist_ok=True)
(public / "pdf_engine.py").write_text(ast.unparse(module) + "\n", encoding="utf-8")
shutil.copytree(root / "assets", public / "brand", dirs_exist_ok=True)
print("Exported desktop PDF engine and brand assets")

res = root / "mobile/android/app/src/main/res"
if res.exists():
    from PIL import Image
    with Image.open(root / "assets/rabpdf_icon.ico") as source_icon:
        icon = source_icon.convert("RGBA")
    for density, size in {"mdpi":48,"hdpi":72,"xhdpi":96,"xxhdpi":144,"xxxhdpi":192}.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(exist_ok=True)
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            icon.resize((size,size), Image.Resampling.LANCZOS).save(folder / name)
        foreground_size = round(size * 108 / 48)
        foreground = Image.new("RGBA", (foreground_size,foreground_size))
        fitted = icon.resize((round(foreground_size*.62),)*2, Image.Resampling.LANCZOS)
        inset=(foreground_size-fitted.width)//2
        foreground.alpha_composite(fitted,(inset,inset))
        foreground.save(folder / "ic_launcher_foreground.png")
    for path in res.glob("drawable*/splash.png"):
        with Image.open(path) as previous:
            splash=Image.new("RGB",previous.size,"white")
        mark=icon.copy()
        size=min(256,round(min(splash.size)*.3))
        mark.thumbnail((size,size),Image.Resampling.LANCZOS)
        splash.paste(mark,((splash.width-mark.width)//2,(splash.height-mark.height)//2),mark)
        splash.save(path)
    print("Android launcher and splash assets updated")
