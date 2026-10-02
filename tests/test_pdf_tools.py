import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from rabpdf import (  # noqa: E402
    APP_AUTHORS,
    APP_VERSION,
    APP_WEBSITE,
    PDFStudio,
    parse_pages,
)


class RabPDFToolsTest(unittest.TestCase):
    def test_official_credit_is_embedded(self):
        self.assertEqual(APP_VERSION, "1.4.1")
        self.assertEqual(APP_AUTHORS, "Nishan Chettri + ChatGPT")
        self.assertEqual(APP_WEBSITE, "https://nishanchettri.com")

    def setUp(self):
        test_root = ROOT / ".test_tmp"
        test_root.mkdir(exist_ok=True)
        self.temp_dir = tempfile.TemporaryDirectory(prefix="rabpdf_tests_", dir=test_root)
        self.folder = Path(self.temp_dir.name)
        self.app = object.__new__(PDFStudio)
        self.first = self.folder / "first.pdf"
        self.second = self.folder / "second.pdf"
        self.make_pdf(self.first, 3, "First")
        self.make_pdf(self.second, 2, "Second")

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def make_pdf(path, pages, label):
        pdf = canvas.Canvas(str(path))
        for number in range(1, pages + 1):
            pdf.setFont("Helvetica", 18)
            pdf.drawString(72, 760, f"{label} page {number}")
            pdf.drawString(72, 720, "Searchable sample text")
            pdf.showPage()
        pdf.save()

    def assert_pdf_pages(self, path, expected):
        self.assertEqual(len(PdfReader(path).pages), expected)

    def test_new_image_tools(self):
        source = self.folder / "source.png"
        Image.effect_noise((400, 300), 80).convert("RGB").save(source)
        for format_name, suffix in (("PNG", "png"), ("JPG", "jpg"), ("BMP", "bmp"), ("TIFF", "tiff"), ("GIF", "gif")):
            output = self.folder / ("converted." + suffix)
            self.app.do_image_convert([source], output, {"format": format_name})
            with Image.open(output) as image:
                self.assertEqual(image.size, (400, 300))
        upscaled = self.folder / "upscaled.png"
        self.app.do_image_upscale([source], upscaled, {"scale": "2x", "format": "PNG", "engine": "Lanczos"})
        with Image.open(upscaled) as image: self.assertEqual(image.size, (800, 600))
        for mode in ("2x", "4x", "8x", "Target size"):
            output = self.folder / (mode.replace(" ", "_") + ".jpg")
            settings = {"compression": mode, "target": "10", "unit": "KB", "format": "JPG"}
            self.app.do_image_compress([source], output, settings)
            target = 10 * 1024 if mode == "Target size" else source.stat().st_size // int(mode[:-1])
            self.assertLessEqual(output.stat().st_size, target)
        output = self.folder / "impossible.jpg"
        with self.assertRaises(ValueError):
            self.app.do_image_compress([source], output, {"compression": "Target size", "target": "0.001", "unit": "KB", "format": "JPG"})
        self.assertFalse(output.exists())

    def test_ai_upscale_preserves_dimensions_and_alpha(self):
        source = self.folder / "alpha.png"
        Image.new("RGBA", (12, 10), (50, 100, 150, 180)).save(source)
        output = self.folder / "ai.png"
        self.app.do_image_upscale([source], output, {"scale": "3x", "format": "PNG", "engine": "AI reconstruction"})
        with Image.open(output) as image:
            self.assertEqual(image.size, (36, 30))
            self.assertEqual(image.getchannel("A").getextrema(), (180, 180))

    def test_qr_generator(self):
        output = self.folder / "qr.png"
        self.app.do_qr([], str(output), {"link": "https://nishanchettri.com"})
        with Image.open(output) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.width, image.height)
            self.assertEqual(image.getpixel((0, 0)), 255)
        for link in ("", "https://", "javascript:alert(1)", "https://bad link.com"):
            with self.assertRaises(ValueError):
                self.app.do_qr([], str(output), {"link": link})

    def test_page_parser(self):
        self.assertEqual(parse_pages("1,3,5-7", 7), [0, 2, 4, 5, 6])
        with self.assertRaises(ValueError):
            parse_pages("8", 7)

    def test_organize_tools(self):
        merged = self.folder / "merged.pdf"
        self.app.do_merge([str(self.first), str(self.second)], str(merged), {})
        self.assert_pdf_pages(merged, 5)

        split = self.folder / "split"
        self.app.do_split([str(self.first)], str(split), {"ranges": "1-2,3"})
        self.assert_pdf_pages(split / "first_part_001.pdf", 2)
        self.assert_pdf_pages(split / "first_part_002.pdf", 1)

        extracted = self.folder / "extracted.pdf"
        self.app.do_extract([str(self.first)], str(extracted), {"pages": "1,3"})
        self.assert_pdf_pages(extracted, 2)

        removed = self.folder / "removed.pdf"
        self.app.do_remove([str(self.first)], str(removed), {"pages": "2"})
        self.assert_pdf_pages(removed, 2)

        rotated = self.folder / "rotated.pdf"
        self.app.do_rotate(
            [str(self.first)], str(rotated),
            {"rotation": "90 clockwise", "pages": "2"},
        )
        self.assertEqual(PdfReader(rotated).pages[1].rotation, 90)

    def test_security_tools(self):
        protected = self.folder / "protected.pdf"
        self.app.do_protect(
            [str(self.first)], str(protected),
            {"password": "test123", "owner": "owner123"},
        )
        self.assertTrue(PdfReader(protected).is_encrypted)

        unlocked = self.folder / "unlocked.pdf"
        self.app.do_unlock(
            [str(protected)], str(unlocked), {"password": "test123"}
        )
        self.assert_pdf_pages(unlocked, 3)

    def test_overlay_metadata_and_text_tools(self):
        watermarked = self.folder / "watermarked.pdf"
        self.app.do_watermark(
            [str(self.first)], str(watermarked),
            {"text": "DRAFT", "position": "Diagonal", "opacity": "20%", "pages": ""},
        )
        self.assert_pdf_pages(watermarked, 3)

        numbered = self.folder / "numbered.pdf"
        self.app.do_numbers(
            [str(self.first)], str(numbered),
            {"position": "Bottom center", "start": "4", "prefix": "Page "},
        )
        self.assert_pdf_pages(numbered, 3)

        metadata = self.folder / "metadata.pdf"
        self.app.do_metadata(
            [str(self.first)], str(metadata),
            {"title": "Test title", "author": "Tester", "subject": "QA", "keywords": "pdf,test"},
        )
        self.assertEqual(PdfReader(metadata).metadata.title, "Test title")

        text = self.folder / "first.txt"
        self.app.do_text([str(self.first)], str(text), {})
        self.assertIn("Searchable sample text", text.read_text(encoding="utf-8"))

    def test_image_rendering_extraction_and_compression(self):
        image_path = self.folder / "sample.png"
        image = Image.new("RGB", (640, 360), "#1264e8")
        ImageDraw.Draw(image).text((30, 30), "RabPDF test", fill="white")
        image.save(image_path)

        image_pdf = self.folder / "image.pdf"
        self.app.do_images_to_pdf(
            [str(image_path)], str(image_pdf),
            {"page_size": "A4", "fit": "Fit image"},
        )
        self.assert_pdf_pages(image_pdf, 1)

        extracted = self.folder / "images"
        self.app.do_images([str(image_pdf)], str(extracted), {})
        self.assertTrue(any(extracted.iterdir()))

        rendered = self.folder / "rendered"
        self.app.do_pdf_to_images(
            [str(self.first)], str(rendered),
            {"format": "PNG", "dpi": "96", "pages": "1-2"},
        )
        self.assertEqual(len(list(rendered.glob("*.png"))), 2)

        compressed = self.folder / "compressed.pdf"
        self.app.do_compress(
            [str(image_pdf)], str(compressed), {"quality": "Balanced"}
        )
        self.assert_pdf_pages(compressed, 1)


if __name__ == "__main__":
    unittest.main()
