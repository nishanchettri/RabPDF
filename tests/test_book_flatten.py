import importlib.util
import math
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("scan_engine", ROOT / "mobile/src/scan_engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class BookFlattenTest(unittest.TestCase):
    def setUp(self):
        (ROOT / ".test_tmp").mkdir(exist_ok=True)

    def test_identity_and_parameter_validation(self):
        with tempfile.TemporaryDirectory(dir=ROOT / ".test_tmp") as folder:
            source, output = Path(folder) / "source.png", Path(folder) / "output.png"
            image = Image.new("RGB", (80, 60), "red")
            image.save(source)
            engine.do_book_flatten(None, [source], output, {"top": 0, "bottom": 0})
            with Image.open(output) as result:
                self.assertEqual(result.tobytes(), image.tobytes())
            for value in ("nan", "inf", "26", "-26"):
                with self.assertRaises(ValueError):
                    engine.do_book_flatten(None, [source], output, {"top": value})

    def test_known_synthetic_curve_is_straightened(self):
        with tempfile.TemporaryDirectory(dir=ROOT / ".test_tmp") as folder:
            source, output = Path(folder) / "source.png", Path(folder) / "output.png"
            image = Image.new("RGB", (320, 160), "white")
            for x in range(image.width):
                shift = round(16 * 4 * (x / image.width) * (1 - x / image.width))
                for y in range(78 + shift, 83 + shift):
                    image.putpixel((x, y), (0, 0, 0))
            image.save(source)
            engine.do_book_flatten(None, [source], output, {"top": 10, "bottom": 10})
            with Image.open(output) as result:
                positions = [min(range(60, 105), key=lambda y: result.getpixel((x, y))[0]) for x in range(16, 304)]
                mean = sum(positions) / len(positions)
                deviation = math.sqrt(sum((y - mean) ** 2 for y in positions) / len(positions))
                self.assertLess(deviation, 1.0)
