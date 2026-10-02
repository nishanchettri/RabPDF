import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from rabpdf import PDFStudio


@unittest.skipUnless(sys.platform == "win32", "Windows desktop layout")
class DesktopLayoutTest(unittest.TestCase):
    def setUp(self):
        self.app = PDFStudio()
        self.app.geometry("940x650")
        self.app.update()

    def tearDown(self):
        for timer in self.app.tk.call("after", "info"):
            self.app.after_cancel(timer)
        self.app.destroy()

    def test_about_close_fits_at_larger_text_scale(self):
        self.app.tk.call("tk", "scaling", 2.0)
        self.app.show_about()
        self.app.update()
        about = next(w for w in self.app.winfo_children() if w.winfo_class() == "Toplevel")
        close = next(w for w in about.winfo_children() if w.winfo_class() == "TButton")
        self.assertLessEqual(close.winfo_y() + close.winfo_height(), about.winfo_height())
        self.assertLessEqual(close.winfo_x() + close.winfo_width(), about.winfo_width())
        about.destroy()

    def test_navigation_uses_icons_and_reveals_selected_group(self):
        self.app.show_tool("image_upscale")
        self.app.update()
        for group, (body, toggle) in self.app.nav_groups.items():
            self.assertEqual(toggle.cget("text"), group)
            self.assertTrue(toggle.cget("image"))
            self.assertEqual(bool(body.winfo_manager()), group == "Image tools")
        self.assertTrue(self.app.tool_buttons["image_upscale"].winfo_ismapped())
        self.assertNotIn("qr", self.app.tool_buttons)


if __name__ == "__main__":
    unittest.main()
