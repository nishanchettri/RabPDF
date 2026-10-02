import io
import os
import sys
import tempfile
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageSequence, ImageTk


APP_NAME = "RabPDF"
APP_VERSION = "1.4.0"
APP_AUTHORS = "Nishan Chettri + ChatGPT"
APP_WEBSITE = "https://nishanchettri.com"
ACCENT = "#2f80ed"
ACCENT_DARK = "#1f65c5"
ACCENT_SOFT = "#e8f2ff"
BG = "#f5f8fc"
PANEL = "#ffffff"
TEXT = "#17243a"
MUTED = "#68778d"
BORDER = "#dce6f2"
SIDEBAR = "#fbfdff"
SIDEBAR_ACTIVE = "#e4f0ff"
if getattr(sys, "frozen", False):
    ASSET_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
else:
    ASSET_DIR = Path(__file__).resolve().parents[1] / "assets"


TOOLS = {
    "merge": ("Merge PDF", "Combine PDF files in the chosen order", "Organize"),
    "split": ("Split PDF", "Save every page or selected page ranges", "Organize"),
    "extract": ("Extract pages", "Create a new PDF from selected pages", "Organize"),
    "remove": ("Remove pages", "Delete selected pages from a PDF", "Organize"),
    "rotate": ("Rotate PDF", "Rotate all or selected pages", "Organize"),
    "compress": ("Compress PDF", "Optimize PDF size", "Optimize"),
    "protect": ("Protect PDF", "Add an open password and permissions", "Security"),
    "unlock": ("Unlock PDF", "Remove password protection you are authorized to remove", "Security"),
    "images_to_pdf": ("Images to PDF", "Combine PNG, JPG, TIFF, or BMP images", "Convert"),
    "pdf_to_images": ("PDF to images", "Render PDF pages as PNG or JPG", "Convert"),
    "text": ("Extract text", "Save searchable PDF text as a UTF-8 file", "Convert"),
    "images": ("Extract images", "Save embedded images without rendering pages", "Convert"),
    "qr": ("Link to QR Code", "Create a scannable PNG from a web link", "Create"),
    "watermark": ("Watermark", "Add text across all or selected pages", "Annotate"),
    "numbers": ("Page numbers", "Stamp page numbers in a chosen position", "Annotate"),
    "metadata": ("Edit metadata", "Set title, author, subject, and keywords", "Annotate"),
    "image_compress": ("Compress image", "Reduce image file size", "Image tools"),
    "image_upscale": ("Upscale image", "Enlarge image dimensions", "Image tools"),
    "image_convert": ("Convert image", "Change image format", "Image tools"),
}

IMAGE_TOOLS = ("image_compress", "image_upscale", "image_convert")
IMAGE_FORMATS = ("PNG", "JPG", "BMP", "TIFF", "GIF")

def compression_target(settings, original_size):
    mode = settings.get("compression", "Quality preset")
    if mode in ("2x", "4x", "8x"):
        return max(1, original_size // int(mode[:-1]))
    if mode == "Target size":
        import math
        value = float(settings.get("target", ""))
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Target size must be a positive finite number.")
        return max(1, int(value * (1024 if settings.get("unit", "KB") == "KB" else 1024 ** 2)))
    return None

def image_extension(settings):
    return {"JPG": ".jpg", "PNG": ".png", "BMP": ".bmp", "TIFF": ".tiff", "GIF": ".gif"}[settings.get("format", "PNG")]

def encode_image(image, format_name, quality=90):
    from PIL import Image
    stream = io.BytesIO()
    if format_name in ("JPG", "BMP"):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, "white")
        background.paste(rgba, mask=rgba.getchannel("A"))
        image = background
    options = {"quality": quality, "optimize": True} if format_name == "JPG" else {}
    if format_name == "PNG": options = {"optimize": True}
    image.save(stream, format="JPEG" if format_name == "JPG" else format_name, **options)
    return stream.getvalue()

def ai_upscale(image, scale):
    import numpy as np
    import onnxruntime as ort
    from PIL import Image
    if scale not in (2, 3): raise ValueError("AI reconstruction supports 2x or native 3x.")
    if image.width * image.height * 9 > 12000000:
        raise ValueError("AI preview exceeds 12 million pixels. Use a smaller input image.")
    if not hasattr(ai_upscale, "session"):
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        ai_upscale.session = ort.InferenceSession(str(ASSET_DIR / "image-super-resolution.onnx"), options, providers=["CPUExecutionProvider"])
    session = ai_upscale.session
    y, cb, cr = image.convert("RGB").convert("YCbCr").split()
    values = np.asarray(y, dtype=np.float32) / 255
    result = np.empty((image.height * 3, image.width * 3), dtype=np.uint8)
    # Overlapping tiles avoid resizing the source and exclude convolution border seams.
    for top in range(0, image.height, 192):
        for left in range(0, image.width, 192):
            rows = np.clip(np.arange(top - 16, top + 208), 0, image.height - 1)
            columns = np.clip(np.arange(left - 16, left + 208), 0, image.width - 1)
            tile = values[np.ix_(rows, columns)][None, None]
            prediction = session.run(None, {session.get_inputs()[0].name: tile})[0][0, 0]
            height, width = min(192, image.height - top), min(192, image.width - left)
            result[top * 3:(top + height) * 3, left * 3:(left + width) * 3] = np.rint(np.clip(prediction[48:48 + height * 3, 48:48 + width * 3], 0, 1) * 255).astype(np.uint8)
    size = (image.width * 3, image.height * 3)
    output = Image.merge("YCbCr", (Image.fromarray(result), cb.resize(size, Image.Resampling.BICUBIC), cr.resize(size, Image.Resampling.BICUBIC))).convert("RGBA")
    output.putalpha(image.getchannel("A").resize(size, Image.Resampling.BICUBIC))
    if scale == 2: output = output.resize((image.width * 2, image.height * 2), Image.Resampling.LANCZOS)
    return output


def human_size(size):
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{int(value)} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024


def default_output(source, suffix, extension=".pdf"):
    path = Path(source)
    return str(path.with_name(f"{path.stem}_{suffix}{extension}"))


def parse_pages(spec, total, allow_empty=False):
    """Parse 1-based page selections such as '1,3,5-8'."""
    if not spec.strip():
        return list(range(total)) if allow_empty else []
    pages = []
    for part in spec.replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            bits = part.split("-", 1)
            start = int(bits[0])
            end = int(bits[1])
            if start > end:
                raise ValueError(f"Invalid descending range: {part}")
            pages.extend(range(start - 1, end))
        else:
            pages.append(int(part) - 1)
    if not pages:
        raise ValueError("Enter at least one page number.")
    bad = [page + 1 for page in pages if page < 0 or page >= total]
    if bad:
        raise ValueError(f"Page {bad[0]} is outside this PDF (1-{total}).")
    return list(dict.fromkeys(pages))


def parse_ranges(spec, total):
    if not spec.strip():
        return [[i] for i in range(total)]
    groups = []
    for group in spec.split(","):
        groups.append(parse_pages(group.strip(), total))
    return groups


def require_pdf_libs():
    try:
        import pypdf  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "The PDF engine is missing. Run install_dependencies.bat, then restart the app."
        ) from exc


class ScrollFrame(ttk.Frame):
    def __init__(self, master):
        super().__init__(master)
        self.canvas = tk.Canvas(self, highlightthickness=0, background=BG)
        bar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.body = ttk.Frame(self.canvas)
        self.window = self.canvas.create_window((0, 0), window=self.body, anchor="nw")
        self.canvas.configure(yscrollcommand=bar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        bar.pack(side="right", fill="y")
        self.body.bind("<Configure>", lambda _e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfigure(self.window, width=e.width))


class PDFStudio(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(f"{APP_NAME} - All-in-one PDF tools")
        self.geometry("1180x760")
        self.minsize(940, 650)
        self.current_tool = "merge"
        self.files = []
        self.busy = False
        self.vars = {}
        self.tool_buttons = {}
        self.logo_image = None
        self.logo_frames = []
        self.logo_durations = []
        self.logo_index = 0
        self.logo_cycles = 0
        self.logo_blink_image = None
        self.logo_label = None
        self.icon_image = None
        self._load_brand_assets()
        self._style()
        self._layout()
        self._animate_logo()
        self.show_tool("merge")

    def _load_brand_assets(self):
        animation_path = ASSET_DIR / "rabpdf_mascot_animated.gif"
        logo_path = ASSET_DIR / "rabpdf_logo_72.png"
        icon_path = ASSET_DIR / "rabpdf_logo_32.png"
        try:
            if animation_path.exists():
                with Image.open(animation_path) as animation:
                    for frame in ImageSequence.Iterator(animation):
                        self.logo_frames.append(ImageTk.PhotoImage(self._round_logo(frame)))
                        self.logo_durations.append(max(40, int(frame.info.get("duration", 65))))
                    animation.seek(0)
                    resting_frame = animation.convert("RGBA")
            if self.logo_frames:
                self.logo_image = self.logo_frames[0]
                blink_path = ASSET_DIR / "rabpdf_logo_blink.png"
                if blink_path.exists():
                    with Image.open(blink_path) as blink:
                        self.logo_blink_image = ImageTk.PhotoImage(
                            self._blink_logo(resting_frame, blink)
                        )
            else:
                with Image.open(logo_path) as logo:
                    self.logo_image = ImageTk.PhotoImage(self._round_logo(logo))
            self.icon_image = tk.PhotoImage(file=str(icon_path))
            self.iconphoto(True, self.icon_image)
        except (OSError, tk.TclError):
            self.logo_image = None
            self.logo_frames = []
            self.logo_durations = []
            self.icon_image = None
        ico_path = ASSET_DIR / "rabpdf_icon.ico"
        if ico_path.exists():
            try:
                self.iconbitmap(str(ico_path))
            except tk.TclError:
                pass

    @staticmethod
    def _blink_logo(resting_frame, blink):
        # Only the eyelid is taken from the generated frame; keep the original art.
        logo = resting_frame.copy()
        lid = blink.convert("RGBA").crop((680, 555, 800, 640))
        lid = lid.resize((12, 9), Image.Resampling.LANCZOS)
        mask = Image.new("L", lid.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, 11, 8), fill=255)
        logo.paste(lid, (58, 44), mask)
        # A tiny rotation of the original ear tip keeps its painted texture.
        ear = logo.crop((56, 8, 72, 29))
        ear = ear.rotate(3, resample=Image.Resampling.BICUBIC,
                         fillcolor=logo.getpixel((73, 15)))
        logo.paste(ear, (56, 8))
        return PDFStudio._round_logo(logo)

    @staticmethod
    def _round_logo(image):
        logo = image.convert("RGBA")
        mask = Image.new("L", logo.size, 0)
        inset = round(4 * logo.width / 104)
        ImageDraw.Draw(mask).ellipse(
            (inset, inset, logo.width - inset - 1, logo.height - inset - 1),
            fill=255,
        )
        logo.putalpha(mask)
        return logo

    def _animate_logo(self):
        if not self.logo_frames or self.logo_label is None:
            return
        self.logo_image = self.logo_frames[self.logo_index]
        self.logo_label.configure(image=self.logo_image)
        delay = self.logo_durations[self.logo_index]
        self.logo_index = (self.logo_index + 1) % len(self.logo_frames)
        if self.logo_index == 0:
            self.logo_cycles += 1
            if self.logo_blink_image is not None and self.logo_cycles % 2 == 0:
                self.logo_label.configure(image=self.logo_blink_image)
                delay = 120
        self.after(delay, self._animate_logo)

    def _style(self):
        self.configure(bg=BG)
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL, relief="solid", borderwidth=1, bordercolor=BORDER)
        style.configure("Header.TFrame", background=BG)
        style.configure("TLabel", background=BG, foreground=TEXT, font=("Segoe UI", 10))
        style.configure("Panel.TLabel", background=PANEL, foreground=TEXT, font=("Segoe UI", 10))
        style.configure("Title.TLabel", background=BG, foreground=TEXT, font=("Segoe UI Semibold", 24))
        style.configure("Subtitle.TLabel", background=BG, foreground=MUTED, font=("Segoe UI", 10))
        style.configure("Eyebrow.TLabel", background=BG, foreground=ACCENT, font=("Segoe UI Semibold", 8))
        style.configure("Section.TLabel", background=PANEL, foreground=TEXT, font=("Segoe UI Semibold", 11))
        style.configure("Hint.TLabel", background=PANEL, foreground=MUTED, font=("Segoe UI", 8))
        style.configure("Accent.TButton", background=ACCENT, foreground="white", font=("Segoe UI Semibold", 10), padding=(18, 11), borderwidth=0)
        style.map("Accent.TButton", background=[("active", ACCENT_DARK), ("disabled", "#9bbcf0")])
        style.configure("TButton", background="#eef4fb", foreground=TEXT, font=("Segoe UI", 9), padding=(11, 7), borderwidth=0)
        style.map("TButton", background=[("active", "#dfeafb")])
        style.configure("TEntry", fieldbackground="#fbfdff", bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER, padding=8)
        style.configure("TCombobox", fieldbackground="#fbfdff", bordercolor=BORDER, lightcolor=BORDER, darkcolor=BORDER, padding=7)
        style.configure("Horizontal.TProgressbar", background=ACCENT, troughcolor=ACCENT_SOFT)

    def _layout(self):
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self._sidebar()

        content = ttk.Frame(self, padding=(34, 26, 34, 20))
        content.grid(row=0, column=1, sticky="nsew")
        content.columnconfigure(0, weight=1)
        content.rowconfigure(3, weight=1)

        self.title_var = tk.StringVar()
        self.desc_var = tk.StringVar()
        self.category_var = tk.StringVar()
        header = ttk.Frame(content, style="Header.TFrame")
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        heading = ttk.Frame(header, style="Header.TFrame")
        heading.grid(row=1, column=0, columnspan=2, sticky="w", pady=(8, 0))
        ttk.Label(heading, textvariable=self.category_var, style="Eyebrow.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(heading, textvariable=self.title_var, style="Title.TLabel").grid(row=1, column=0, sticky="w", pady=(2, 0))
        ttk.Label(heading, textvariable=self.desc_var, style="Subtitle.TLabel").grid(row=2, column=0, sticky="w", pady=(4, 0))

        actions = ttk.Frame(header, style="Header.TFrame")
        actions.grid(row=0, column=0, columnspan=2, sticky="e", pady=(4, 0))
        self.qr_shortcut = ttk.Button(
            actions, text="Link to QR", command=lambda: self.show_tool("qr")
        )
        self.qr_shortcut.pack(side="left", padx=(0, 12))
        trust = tk.Frame(actions, bg=ACCENT_SOFT, highlightthickness=1, highlightbackground="#c9e0ff")
        trust.pack(side="left")
        tk.Label(trust, text="OFFLINE", bg=ACCENT_SOFT, fg=ACCENT_DARK, font=("Segoe UI Semibold", 8)).pack(anchor="e", padx=12, pady=(7, 0))
        tk.Label(trust, text="Files stay on this computer", bg=ACCENT_SOFT, fg=MUTED, font=("Segoe UI", 8)).pack(anchor="e", padx=12, pady=(0, 7))

        tk.Frame(content, bg=BORDER, height=1).grid(row=1, column=0, sticky="ew", pady=(20, 18))

        self.scroller = ScrollFrame(content)
        self.scroller.grid(row=3, column=0, sticky="nsew")
        self.scroller.body.columnconfigure(0, weight=1)

        footer = ttk.Frame(content)
        footer.grid(row=4, column=0, sticky="ew", pady=(12, 0))
        self.status_var = tk.StringVar(value="Ready")
        self.status_badge = tk.Label(footer, text="READY", bg="#e7f7ee", fg="#217a48", font=("Segoe UI Semibold", 8), padx=9, pady=4)
        self.status_badge.grid(row=0, column=0, sticky="w")
        ttk.Label(footer, textvariable=self.status_var, style="Subtitle.TLabel").grid(row=0, column=1, sticky="w", padx=(10, 0))
        footer.columnconfigure(1, weight=1)
        self.progress = ttk.Progressbar(footer, mode="indeterminate", length=160)
        self.progress.grid(row=0, column=2, padx=(16, 0))

    def _sidebar(self):
        side = tk.Frame(self, bg=SIDEBAR, width=252, highlightthickness=1, highlightbackground=BORDER)
        side.grid(row=0, column=0, sticky="nsw")
        side.grid_propagate(False)
        side.pack_propagate(False)
        brand = tk.Frame(side, bg=SIDEBAR)
        brand.pack(fill="x", padx=18, pady=(18, 12))
        if self.logo_image:
            self.logo_label = tk.Label(brand, image=self.logo_image, bg=SIDEBAR, bd=0)
            self.logo_label.pack(side="left")
        wordmark = tk.Frame(brand, bg=SIDEBAR)
        wordmark.pack(side="left", padx=(10, 0))
        tk.Label(wordmark, text="RabPDF", bg=SIDEBAR, fg=TEXT, font=("Segoe UI Semibold", 20)).pack(anchor="w")
        tk.Label(wordmark, text="PDF TOOLBOX", bg=SIDEBAR, fg=ACCENT, font=("Segoe UI Semibold", 8)).pack(anchor="w")
        menu = ScrollFrame(side)
        menu.pack(fill="both", expand=True)
        for group in ("PDF tools", "Image tools"):
            section = tk.Frame(menu.body, bg=SIDEBAR)
            section.pack(fill="x")
            content = tk.Frame(section, bg=SIDEBAR)
            toggle = tk.Button(section, text=f">  {group}", anchor="w", relief="flat", bg=SIDEBAR,
                               fg=TEXT, font=("Segoe UI Semibold", 10), padx=18, pady=9)
            toggle.pack(fill="x")
            def collapse(body=content, button=toggle, title=group):
                if body.winfo_manager():
                    body.pack_forget(); button.configure(text=f">  {title}")
                else:
                    body.pack(fill="x"); button.configure(text=f"v  {title}")
            toggle.configure(command=collapse)
            for key, (name, _desc, category) in TOOLS.items():
                if key == "qr" or (key in IMAGE_TOOLS) != (group == "Image tools"):
                    continue
                button = tk.Button(
                    content, text=name, anchor="w", relief="flat", bd=0, cursor="hand2",
                    bg=SIDEBAR, fg="#44536a", activebackground=SIDEBAR_ACTIVE, activeforeground=TEXT,
                    font=("Segoe UI", 9), padx=22, pady=5, command=lambda k=key: self.show_tool(k)
                )
                button.pack(fill="x")
                self.tool_buttons[key] = button
        footer = tk.Frame(side, bg=SIDEBAR)
        footer.pack(side="bottom", fill="x", padx=16, pady=(8, 14))
        tk.Frame(footer, bg=BORDER, height=1).pack(fill="x", pady=(0, 10))
        tk.Button(
            footer, text="About RabPDF", anchor="w", relief="flat", bd=0,
            cursor="hand2", bg=SIDEBAR, fg=ACCENT,
            activebackground=SIDEBAR_ACTIVE, activeforeground=ACCENT_DARK,
            font=("Segoe UI", 8), padx=0, pady=2, command=self.show_about,
        ).pack(fill="x")
        tk.Button(
            footer, text=APP_AUTHORS,
            anchor="w", relief="flat", bd=0, cursor="hand2",
            bg=SIDEBAR, fg="#73839a", activebackground=SIDEBAR,
            activeforeground=ACCENT, font=("Segoe UI", 7, "underline"),
            padx=0, pady=0, command=self.open_author_site,
        ).pack(fill="x", pady=(2, 0))
        tk.Label(
            footer, text=f"Version {APP_VERSION}", bg=SIDEBAR,
            fg="#9aa6b7", font=("Segoe UI", 7),
        ).pack(anchor="w")

    def open_author_site(self):
        webbrowser.open_new_tab(APP_WEBSITE)

    def show_about(self):
        about = tk.Toplevel(self)
        about.title(f"About {APP_NAME}")
        about.geometry("440x360")
        about.resizable(False, False)
        about.transient(self)
        about.grab_set()
        about.configure(bg=PANEL)

        if self.logo_frames:
            tk.Label(about, image=self.logo_frames[0], bg=PANEL, bd=0).pack(pady=(24, 8))
        tk.Label(
            about, text=APP_NAME, bg=PANEL, fg=TEXT,
            font=("Segoe UI Semibold", 22),
        ).pack()
        tk.Label(
            about, text="A private, local PDF toolbox", bg=PANEL, fg=MUTED,
            font=("Segoe UI", 9),
        ).pack(pady=(2, 16))
        tk.Label(
            about, text="Created by", bg=PANEL, fg=MUTED,
            font=("Segoe UI", 8),
        ).pack()
        tk.Button(
            about, text=APP_AUTHORS, relief="flat", bd=0, cursor="hand2",
            bg=PANEL, fg=ACCENT, activebackground=PANEL,
            activeforeground=ACCENT_DARK,
            font=("Segoe UI Semibold", 11, "underline"),
            command=self.open_author_site,
        ).pack(pady=(2, 2))
        tk.Label(
            about, text="nishanchettri.com", bg=PANEL, fg=MUTED,
            font=("Segoe UI", 8),
        ).pack(pady=(0, 10))
        tk.Label(
            about, text=f"Version {APP_VERSION}", bg=PANEL, fg=MUTED,
            font=("Segoe UI", 8),
        ).pack()
        ttk.Button(about, text="Close", command=about.destroy).pack(pady=(18, 0))
        about.protocol("WM_DELETE_WINDOW", about.destroy)

    def show_tool(self, key):
        if self.busy:
            return
        self.current_tool = key
        self.files = []
        for child in self.scroller.body.winfo_children():
            child.destroy()
        for name, button in self.tool_buttons.items():
            selected = name == key
            button.configure(
                bg=SIDEBAR_ACTIVE if selected else SIDEBAR,
                fg=ACCENT_DARK if selected else "#44536a",
                font=("Segoe UI Semibold", 9) if selected else ("Segoe UI", 9),
            )
        title, desc, group = TOOLS[key]
        self.category_var.set(group.upper())
        self.title_var.set(title)
        self.desc_var.set(desc)
        self.status_var.set("Ready")
        self.status_badge.configure(text="READY", bg="#e7f7ee", fg="#217a48")
        self.vars = {}
        self._build_tool(key)

    def var(self, name, value=""):
        self.vars[name] = tk.StringVar(value=value)
        return self.vars[name]

    def _panel(self, row, title):
        frame = ttk.Frame(self.scroller.body, style="Panel.TFrame", padding=20)
        frame.grid(row=row, column=0, sticky="ew", pady=(0, 14))
        frame.columnconfigure(0, weight=1)
        ttk.Label(frame, text=title, style="Section.TLabel").grid(row=0, column=0, sticky="w", pady=(0, 12))
        return frame

    def _build_tool(self, key):
        requires_input = key != "qr"
        multiple = True
        if requires_input:
            input_title = "Files" if multiple else "Input file"
            panel = self._panel(0, input_title)
            self.file_list = tk.Listbox(
                panel, height=5 if multiple else 3, relief="flat", bd=0,
                highlightthickness=1, highlightbackground=BORDER, highlightcolor=ACCENT,
                selectmode=tk.EXTENDED, font=("Segoe UI", 9),
                bg="#f9fbfe", fg=TEXT, selectbackground=ACCENT_SOFT,
                selectforeground=ACCENT_DARK, activestyle="none",
            )
            self.file_list.grid(row=1, column=0, columnspan=4, sticky="ew")
            ttk.Button(panel, text="Choose files", command=lambda: self.choose_files(self.vars.get("mode", tk.StringVar(value="Batch")).get() == "Batch" or key in ("merge", "images_to_pdf"))).grid(row=2, column=0, sticky="w", pady=(10, 0))
            if multiple:
                ttk.Button(panel, text="Move up", command=lambda: self.move_file(-1)).grid(row=2, column=1, pady=(10, 0), padx=5)
                ttk.Button(panel, text="Move down", command=lambda: self.move_file(1)).grid(row=2, column=2, pady=(10, 0), padx=5)
            ttk.Button(panel, text="Remove", command=self.remove_files).grid(row=2, column=3, sticky="e", pady=(10, 0))

        options_row = 1 if requires_input else 0
        options = self._panel(options_row, "Options")
        options.columnconfigure(1, weight=1)
        self._tool_options(options, key)
        if key not in ("merge", "images_to_pdf", "qr"):
            mode = self._combo(options, 10, "Processing", "mode", ("Single file", "Batch"))
            mode.bind("<<ComboboxSelected>>", lambda _event: self.output_var.set(self.suggest_output() if self.files else ""))

        output = self._panel(options_row + 1, "Output")
        output.columnconfigure(0, weight=1)
        self.output_var = self.var("output")
        ttk.Entry(output, textvariable=self.output_var).grid(row=1, column=0, sticky="ew")
        ttk.Button(output, text="Browse", command=self.choose_output).grid(row=1, column=1, padx=(10, 0))
        self.run_button = ttk.Button(output, text=f"Run {TOOLS[key][0]}", style="Accent.TButton", command=self.run_tool)
        self.run_button.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(14, 0))
        if key in ("compress", "image_compress"):
            ttk.Button(output, text="Estimate size", command=lambda: self.run_tool(estimate=True)).grid(row=3, column=0, columnspan=2, pady=(8, 0))

    def _label_entry(self, frame, row, label, name, value="", secret=False):
        ttk.Label(frame, text=label, style="Panel.TLabel").grid(row=row, column=0, sticky="w", padx=(0, 12), pady=5)
        entry = ttk.Entry(frame, textvariable=self.var(name, value), show="*" if secret else "")
        entry.grid(row=row, column=1, sticky="ew", pady=5)
        return entry

    def _combo(self, frame, row, label, name, values, value=None):
        ttk.Label(frame, text=label, style="Panel.TLabel").grid(row=row, column=0, sticky="w", padx=(0, 12), pady=5)
        combo = ttk.Combobox(frame, textvariable=self.var(name, value or values[0]), values=values, state="readonly")
        combo.grid(row=row, column=1, sticky="ew", pady=5)
        return combo

    def _tool_options(self, frame, key):
        if key == "split":
            self._label_entry(frame, 1, "Ranges", "ranges", "")
            ttk.Label(frame, text="Leave empty for one file per page, or use 1-3,4-6,7.", style="Panel.TLabel", foreground=MUTED).grid(row=2, column=1, sticky="w")
        elif key in ("extract", "remove"):
            self._label_entry(frame, 1, "Pages", "pages", "1")
            ttk.Label(frame, text="Examples: 1,3,5-8", style="Panel.TLabel", foreground=MUTED).grid(row=2, column=1, sticky="w")
        elif key == "rotate":
            self._combo(frame, 1, "Rotation", "rotation", ("90 clockwise", "180", "90 counter-clockwise"))
            self._label_entry(frame, 2, "Pages", "pages", "")
            ttk.Label(frame, text="Leave pages empty to rotate every page.", style="Panel.TLabel", foreground=MUTED).grid(row=3, column=1, sticky="w")
        elif key == "compress":
            self._combo(
                frame, 1, "Quality", "quality",
                ("Lossless optimization", "Balanced", "Smallest file"), "Balanced"
            )
        elif key in IMAGE_TOOLS:
            self._combo(frame, 1, "Output format", "format", IMAGE_FORMATS, "JPG" if key == "image_compress" else "PNG")
            if key == "image_compress":
                self._compression_options(frame, 2)
            elif key == "image_upscale":
                self._combo(frame, 2, "Scale", "scale", ("2x", "3x"), "3x")
                self._combo(frame, 3, "Method", "engine", ("AI reconstruction", "Lanczos"))
        elif key == "protect":
            self._label_entry(frame, 1, "Open password", "password", secret=True)
            self._label_entry(frame, 2, "Owner password", "owner", secret=True)
        elif key == "unlock":
            self._label_entry(frame, 1, "Current password", "password", secret=True)
        elif key == "images_to_pdf":
            self._combo(frame, 1, "Page fit", "fit", ("Fit image", "Fill page"), "Fit image")
            self._combo(frame, 2, "Page size", "page_size", ("A4", "Letter", "Match each image"), "A4")
        elif key == "pdf_to_images":
            self._combo(frame, 1, "Image format", "format", ("PNG", "JPG"), "PNG")
            self._combo(frame, 2, "Resolution", "dpi", ("96", "150", "200", "300"), "150")
            self._label_entry(frame, 3, "Pages", "pages", "")
        elif key == "text":
            ttk.Label(frame, text="Text extraction works only when the PDF contains a searchable text layer.", style="Panel.TLabel", foreground=MUTED).grid(row=1, column=0, columnspan=2, sticky="w")
        elif key == "images":
            ttk.Label(frame, text="Embedded images are extracted as stored; page layouts are not rendered.", style="Panel.TLabel", foreground=MUTED).grid(row=1, column=0, columnspan=2, sticky="w")
        elif key == "watermark":
            self._label_entry(frame, 1, "Watermark text", "text", "CONFIDENTIAL")
            self._combo(frame, 2, "Position", "position", ("Diagonal", "Center", "Top", "Bottom"), "Diagonal")
            self._combo(frame, 3, "Opacity", "opacity", ("10%", "20%", "30%", "40%", "50%"), "20%")
            self._label_entry(frame, 4, "Pages", "pages", "")
        elif key == "numbers":
            self._combo(frame, 1, "Position", "position", ("Bottom center", "Bottom right", "Bottom left", "Top center", "Top right", "Top left"), "Bottom center")
            self._label_entry(frame, 2, "Start number", "start", "1")
            self._label_entry(frame, 3, "Prefix", "prefix", "")
        elif key == "metadata":
            self._label_entry(frame, 1, "Title", "title")
            self._label_entry(frame, 2, "Author", "author")
            self._label_entry(frame, 3, "Subject", "subject")
            self._label_entry(frame, 4, "Keywords", "keywords")
        elif key == "qr":
            link = self._label_entry(frame, 1, "Web link", "link", "https://")
            link.focus_set()
            self._combo(frame, 2, "Size", "size", ("Small", "Medium", "Large"), "Medium")
            self._combo(frame, 3, "Border", "border", ("Standard", "Compact"), "Standard")
            ttk.Label(
                frame, text="Links must begin with http:// or https://.",
                style="Panel.TLabel", foreground=MUTED,
            ).grid(row=4, column=1, sticky="w")
        else:
            ttk.Label(frame, text="Files will be combined in the order shown above.", style="Panel.TLabel", foreground=MUTED).grid(row=1, column=0, columnspan=2, sticky="w")

    def _compression_options(self, frame, row):
        self._combo(frame, row, "Compression", "compression", ("Quality preset", "Target size", "2x", "4x", "8x"))
        self._label_entry(frame, row + 1, "Target size", "target", "100")
        self._combo(frame, row + 2, "Unit", "unit", ("KB", "MB"))

    def choose_files(self, multiple):
        images = self.current_tool == "images_to_pdf" or self.current_tool in IMAGE_TOOLS
        types = [("Images", "*.png *.jpg *.jpeg *.tif *.tiff *.bmp *.gif")] if images else [("PDF files", "*.pdf")]
        paths = filedialog.askopenfilenames(title="Choose files", filetypes=types) if multiple else [filedialog.askopenfilename(title="Choose file", filetypes=types)]
        if not multiple and any(paths): self.files = []
        for path in paths:
            if path and path not in self.files:
                self.files.append(path)
        self.refresh_files()
        if self.files and not self.output_var.get():
            self.output_var.set(self.suggest_output())

    def refresh_files(self):
        self.file_list.delete(0, tk.END)
        for path in self.files:
            try:
                size = human_size(os.path.getsize(path))
            except OSError:
                size = "missing"
            self.file_list.insert(tk.END, f"{Path(path).name}   ({size})")

    def remove_files(self):
        selected = list(self.file_list.curselection())
        for index in reversed(selected):
            self.files.pop(index)
        self.refresh_files()

    def move_file(self, direction):
        selected = self.file_list.curselection()
        if len(selected) != 1:
            return
        old = selected[0]
        new = max(0, min(len(self.files) - 1, old + direction))
        if new == old:
            return
        self.files[old], self.files[new] = self.files[new], self.files[old]
        self.refresh_files()
        self.file_list.selection_set(new)

    def suggest_output(self):
        source = self.files[0]
        key = self.current_tool
        if self.vars.get("mode") and self.vars["mode"].get() == "Batch":
            return str(Path(source).with_name(f"rabpdf_{key}_batch"))
        if key in IMAGE_TOOLS:
            return default_output(source, key, image_extension({k: v.get() for k, v in self.vars.items()}))
        if key in ("split", "pdf_to_images", "images"):
            return str(Path(source).with_name(f"{Path(source).stem}_{key}"))
        if key == "text":
            return default_output(source, "text", ".txt")
        if key == "images_to_pdf":
            return str(Path(source).with_name("images_combined.pdf"))
        return default_output(source, key)

    def choose_output(self):
        folder_tools = ("split", "pdf_to_images", "images")
        if self.current_tool in folder_tools or (self.vars.get("mode") and self.vars["mode"].get() == "Batch"):
            path = filedialog.askdirectory(title="Choose output folder")
        else:
            if self.current_tool in IMAGE_TOOLS:
                ext = image_extension({k: v.get() for k, v in self.vars.items()})
                types = [("Image", "*" + ext)]
            elif self.current_tool == "text":
                ext, types = ".txt", [("Text", "*.txt")]
            elif self.current_tool == "qr":
                ext, types = ".png", [("PNG image", "*.png")]
            else:
                ext, types = ".pdf", [("PDF", "*.pdf")]
            path = filedialog.asksaveasfilename(title="Choose output file", defaultextension=ext, filetypes=types)
        if path:
            self.output_var.set(path)

    def run_tool(self, estimate=False):
        if self.busy: return
        try:
            if self.current_tool != "qr" and not self.files:
                raise ValueError("Choose at least one input file.")
            if self.current_tool not in ("merge", "images_to_pdf", "qr") and self.vars["mode"].get() != "Batch" and len(self.files) != 1:
                raise ValueError("This tool accepts one input file.")
            output = self.output_var.get().strip()
            if self.current_tool in IMAGE_TOOLS and self.vars["mode"].get() != "Batch" and output:
                output = str(Path(output).with_suffix(image_extension({k: v.get() for k, v in self.vars.items()})))
                self.output_var.set(output)
            if not output and not estimate:
                raise ValueError("Choose an output location.")
            input_abs = {os.path.normcase(os.path.abspath(path)) for path in self.files}
            if os.path.normcase(os.path.abspath(output)) in input_abs:
                raise ValueError("The output must be different from the input file.")
        except ValueError as exc:
            messagebox.showerror(APP_NAME, str(exc))
            return
        self.busy = True
        self.run_button.state(["disabled"])
        self.progress.start(12)
        self.status_badge.configure(text="WORKING", bg=ACCENT_SOFT, fg=ACCENT_DARK)
        self.status_var.set(f"Running {TOOLS[self.current_tool][0]}...")
        settings = {name: value.get() for name, value in self.vars.items()}
        threading.Thread(target=self._worker, args=(self.current_tool, list(self.files), output, settings, estimate), daemon=True).start()

    def _worker(self, tool, files, output, settings, estimate=False):
        preview = tempfile.mkdtemp(prefix="rabpdf_preview_") if estimate else None
        try:
            if preview:
                ext = image_extension(settings) if tool in IMAGE_TOOLS else ".pdf"
                output = str(Path(preview) / ("batch" if settings.get("mode") == "Batch" else "preview" + ext))
            if tool not in (*IMAGE_TOOLS, "qr"):
                require_pdf_libs()
            if settings.get("mode") == "Batch":
                folder = Path(output)
                folder.mkdir(parents=True, exist_ok=True)
                messages = []
                for index, source in enumerate(files):
                    ext = image_extension(settings) if tool in IMAGE_TOOLS else ".txt" if tool == "text" else ".pdf"
                    target = folder / f"{index + 1:03d}_{Path(source).stem}_{tool}{ext}"
                    if tool in ("split", "images", "pdf_to_images"): target = target.with_suffix("")
                    if target.exists(): raise ValueError(f"Output already exists: {target.name}. Choose a new folder.")
                    messages.append(getattr(self, f"do_{tool}")([source], str(target), settings))
                result = "\n".join(messages)
            else:
                result = getattr(self, f"do_{tool}")(files, output, settings)
            if preview:
                total = sum(p.stat().st_size for p in Path(preview).rglob("*") if p.is_file())
                result = f"Input: {human_size(sum(os.path.getsize(p) for p in files))}\nEstimated output: {human_size(total)}\nPreview only; no output saved."
            self.after(0, self._finished, True, result)
        except Exception as exc:
            self.after(0, self._finished, False, str(exc))
        finally:
            if preview:
                import shutil
                shutil.rmtree(preview, ignore_errors=True)

    def _finished(self, success, message):
        self.busy = False
        self.progress.stop()
        self.run_button.state(["!disabled"])
        self.status_var.set(message if success else "Operation failed")
        if success:
            self.status_badge.configure(text="DONE", bg="#e7f7ee", fg="#217a48")
        else:
            self.status_badge.configure(text="ERROR", bg="#fff0f0", fg="#b42318")
        (messagebox.showinfo if success else messagebox.showerror)(APP_NAME, message)

    @staticmethod
    def _reader(path, password=""):
        from pypdf import PdfReader
        reader = PdfReader(path)
        if reader.is_encrypted:
            if not password or reader.decrypt(password) == 0:
                raise ValueError("The PDF is encrypted. Enter the correct password using Unlock PDF first.")
        return reader

    def do_image_convert(self, files, output, settings):
        from PIL import Image, ImageOps
        with Image.open(files[0]) as source:
            if getattr(source, "n_frames", 1) != 1:
                raise ValueError("Animated or multipage images are not supported by this image tool.")
            image = ImageOps.exif_transpose(source).convert("RGBA")
        data = encode_image(image, settings.get("format", "PNG"))
        Path(output).write_bytes(data)
        return f"Saved {Path(output).name}: {human_size(len(data))}."

    def do_image_upscale(self, files, output, settings):
        from PIL import Image, ImageOps
        scale = int(settings.get("scale", "2x")[:-1])
        if scale not in (2, 3): raise ValueError("Choose 2x or 3x.")
        with Image.open(files[0]) as source:
            if getattr(source, "n_frames", 1) != 1: raise ValueError("Use a single-frame image.")
            image = ImageOps.exif_transpose(source).convert("RGBA")
        width, height = image.width * scale, image.height * scale
        if width * height > 12000000: raise ValueError("Upscaled image exceeds 12 million pixels. Choose a smaller scale.")
        method = settings.get("engine", "AI reconstruction")
        image = ai_upscale(image, scale) if method == "AI reconstruction" else image.resize((width, height), Image.Resampling.LANCZOS)
        Path(output).write_bytes(encode_image(image, settings.get("format", "PNG")))
        return f"Saved {width} x {height} pixels using {method}."

    def do_image_compress(self, files, output, settings):
        from PIL import Image, ImageOps
        with Image.open(files[0]) as source:
            if getattr(source, "n_frames", 1) != 1: raise ValueError("Use a single-frame image.")
            image = ImageOps.exif_transpose(source).convert("RGBA")
        target = compression_target(settings, os.path.getsize(files[0]))
        format_name = settings.get("format", "JPG")
        best = encode_image(image, format_name, 80)
        if target:
            for step in range(24):
                for quality in ((90, 75, 60, 40, 20) if format_name == "JPG" else (80,)):
                    data = encode_image(image, format_name, quality)
                    if len(data) < len(best): best = data
                    if len(best) <= target: break
                if len(best) <= target: break
                if image.width == 1 and image.height == 1: break
                image = image.resize((max(1, int(image.width * .75)), max(1, int(image.height * .75))), Image.Resampling.LANCZOS)
            if len(best) > target:
                raise ValueError(f"Could not reach {human_size(target)}. Smallest preview: {human_size(len(best))}; no output saved.")
        Path(output).write_bytes(best)
        return f"Input: {human_size(os.path.getsize(files[0]))}; output: {human_size(len(best))}."

    def do_merge(self, files, output, _settings):
        from pypdf import PdfWriter
        writer = PdfWriter()
        for path in files:
            writer.append(path)
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        writer.write(output)
        writer.close()
        return f"Merged {len(files)} files into {Path(output).name}."

    def do_split(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        groups = parse_ranges(settings["ranges"], len(reader.pages))
        folder = Path(output)
        folder.mkdir(parents=True, exist_ok=True)
        stem = Path(files[0]).stem
        for index, pages in enumerate(groups, 1):
            writer = PdfWriter()
            for page in pages:
                writer.add_page(reader.pages[page])
            writer.write(folder / f"{stem}_part_{index:03d}.pdf")
            writer.close()
        return f"Created {len(groups)} PDF files in {folder.name}."

    def do_extract(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        pages = parse_pages(settings["pages"], len(reader.pages))
        writer = PdfWriter()
        for page in pages:
            writer.add_page(reader.pages[page])
        writer.write(output)
        writer.close()
        return f"Extracted {len(pages)} pages."

    def do_remove(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        remove = set(parse_pages(settings["pages"], len(reader.pages)))
        keep = [i for i in range(len(reader.pages)) if i not in remove]
        if not keep:
            raise ValueError("You cannot remove every page.")
        writer = PdfWriter()
        for page in keep:
            writer.add_page(reader.pages[page])
        writer.write(output)
        writer.close()
        return f"Removed {len(remove)} pages; kept {len(keep)}."

    def do_rotate(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        pages = set(parse_pages(settings["pages"], len(reader.pages), allow_empty=True))
        angle = {"90 clockwise": 90, "180": 180, "90 counter-clockwise": 270}[settings["rotation"]]
        writer = PdfWriter()
        for index, page in enumerate(reader.pages):
            if index in pages:
                page.rotate(angle)
            writer.add_page(page)
        writer.write(output)
        writer.close()
        return f"Rotated {len(pages)} pages."

    def do_compress(self, files, output, settings):
        from pypdf import PdfWriter

        reader = self._reader(files[0])
        writer = PdfWriter()
        mode = settings["quality"]
        image_quality = {"Balanced": 72, "Smallest file": 48}.get(mode)

        for source_page in reader.pages:
            writer.add_page(source_page)
            page = writer.pages[-1]
            page.compress_content_streams(level=9)
            if image_quality is not None:
                for embedded in list(page.images):
                    try:
                        image = embedded.image
                        if image.mode not in ("RGB", "L"):
                            image = image.convert("RGB")
                        embedded.replace(image, quality=image_quality, optimize=True)
                    except Exception:
                        # Some inline or unusual image encodings cannot be replaced safely.
                        continue

        if reader.metadata:
            metadata = {
                str(key): str(value)
                for key, value in reader.metadata.items()
                if value is not None
            }
            writer.add_metadata(metadata)
        writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
        writer.write(output)
        writer.close()

        before, after = os.path.getsize(files[0]), os.path.getsize(output)
        change = (before - after) / before * 100 if before else 0
        if change >= 0:
            return f"Finished: {human_size(before)} to {human_size(after)} ({change:.1f}% smaller)."
        return (
            f"Finished, but this PDF grew by {-change:.1f}%. It was probably already optimized. "
            "Keep the original unless the new file is useful."
        )

    def do_protect(self, files, output, settings):
        from pypdf import PdfWriter
        if not settings["password"]:
            raise ValueError("Enter an open password.")
        reader = self._reader(files[0])
        writer = PdfWriter()
        writer.clone_document_from_reader(reader)
        writer.encrypt(settings["password"], settings["owner"] or None, algorithm="AES-256")
        writer.write(output)
        writer.close()
        return "Created an AES-256 encrypted PDF."

    def do_unlock(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0], settings["password"])
        writer = PdfWriter()
        writer.clone_document_from_reader(reader)
        writer.write(output)
        writer.close()
        return "Password protection was removed."

    def do_images_to_pdf(self, files, output, settings):
        from PIL import Image, ImageOps
        from reportlab.lib.pagesizes import A4, LETTER
        from reportlab.pdfgen import canvas
        sizes = {"A4": A4, "Letter": LETTER}
        pdf = canvas.Canvas(output)
        for image_path in files:
            with Image.open(image_path) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                width, height = image.size
                page_w, page_h = (width, height) if settings["page_size"] == "Match each image" else sizes[settings["page_size"]]
                pdf.setPageSize((page_w, page_h))
                scale = max(page_w / width, page_h / height) if settings["fit"] == "Fill page" else min(page_w / width, page_h / height)
                draw_w, draw_h = width * scale, height * scale
                x, y = (page_w - draw_w) / 2, (page_h - draw_h) / 2
                temp = io.BytesIO()
                image.save(temp, format="JPEG", quality=92)
                temp.seek(0)
                from reportlab.lib.utils import ImageReader
                pdf.drawImage(ImageReader(temp), x, y, draw_w, draw_h, preserveAspectRatio=True)
                pdf.showPage()
        pdf.save()
        return f"Combined {len(files)} images into a PDF."

    def do_pdf_to_images(self, files, output, settings):
        import pypdfium2 as pdfium
        folder = Path(output)
        folder.mkdir(parents=True, exist_ok=True)
        fmt = settings["format"].lower()
        dpi = int(settings["dpi"])
        pdf = pdfium.PdfDocument(files[0])
        pages = parse_pages(settings["pages"], len(pdf), allow_empty=True)
        for page_index in pages:
            page = pdf[page_index]
            bitmap = page.render(scale=dpi / 72)
            image = bitmap.to_pil()
            destination = folder / f"page_{page_index + 1:03d}.{fmt}"
            image.save(destination, format="JPEG" if fmt == "jpg" else "PNG", quality=92)
            bitmap.close()
            page.close()
        pdf.close()
        return f"Rendered {len(pages)} pages as {settings['format']} images."

    def do_text(self, files, output, _settings):
        reader = self._reader(files[0])
        chunks = []
        for index, page in enumerate(reader.pages, 1):
            chunks.append(f"--- Page {index} ---\n{page.extract_text() or ''}")
        Path(output).write_text("\n\n".join(chunks), encoding="utf-8")
        return f"Extracted text from {len(chunks)} pages."

    def do_images(self, files, output, _settings):
        reader = self._reader(files[0])
        folder = Path(output)
        folder.mkdir(parents=True, exist_ok=True)
        count = 0
        for page_number, page in enumerate(reader.pages, 1):
            for embedded in page.images:
                try:
                    suffix = Path(embedded.name).suffix or ".bin"
                    count += 1
                    destination = folder / f"page_{page_number:03d}_image_{count:03d}{suffix}"
                    destination.write_bytes(embedded.data)
                except Exception:
                    continue
        if not count:
            raise RuntimeError("No directly extractable embedded images were found. Use PDF to images to render whole pages instead.")
        return f"Extracted {count} embedded images."

    @staticmethod
    def _overlay(width, height, drawer):
        from reportlab.pdfgen import canvas
        packet = io.BytesIO()
        pdf = canvas.Canvas(packet, pagesize=(width, height))
        drawer(pdf, width, height)
        pdf.save()
        packet.seek(0)
        from pypdf import PdfReader
        return PdfReader(packet).pages[0]

    def do_watermark(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        selected = set(parse_pages(settings["pages"], len(reader.pages), allow_empty=True))
        opacity = int(settings["opacity"].rstrip("%")) / 100
        writer = PdfWriter()
        for index, source_page in enumerate(reader.pages):
            writer.add_page(source_page)
            page = writer.pages[-1]
            if index in selected:
                width, height = float(page.mediabox.width), float(page.mediabox.height)
                def draw(pdf, w, h, text=settings["text"], pos=settings["position"]):
                    pdf.saveState(); pdf.setFillAlpha(opacity); pdf.setFillColorRGB(0.07, 0.39, 0.91)
                    size = max(18, min(w, h) / 10); pdf.setFont("Helvetica-Bold", size)
                    if pos == "Diagonal":
                        pdf.translate(w / 2, h / 2); pdf.rotate(35); pdf.drawCentredString(0, -size / 3, text)
                    elif pos == "Center": pdf.drawCentredString(w / 2, h / 2, text)
                    elif pos == "Top": pdf.drawCentredString(w / 2, h - 45, text)
                    else: pdf.drawCentredString(w / 2, 30, text)
                    pdf.restoreState()
                page.merge_page(self._overlay(width, height, draw))
        writer.write(output); writer.close()
        return f"Added watermark to {len(selected)} pages."

    def do_numbers(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        start = int(settings["start"])
        writer = PdfWriter()
        for index, source_page in enumerate(reader.pages):
            writer.add_page(source_page)
            page = writer.pages[-1]
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            label = f"{settings['prefix']}{start + index}"
            def draw(pdf, w, h, text=label, pos=settings["position"]):
                pdf.setFont("Helvetica", 10); margin = 28
                y = h - margin if pos.startswith("Top") else margin
                if pos.endswith("left"): pdf.drawString(margin, y, text)
                elif pos.endswith("right"): pdf.drawRightString(w - margin, y, text)
                else: pdf.drawCentredString(w / 2, y, text)
            page.merge_page(self._overlay(width, height, draw))
        writer.write(output); writer.close()
        return f"Numbered {len(reader.pages)} pages."

    def do_qr(self, files, output, settings):
        import qrcode
        from qrcode.exceptions import DataOverflowError

        link = settings.get("link", "").strip()
        parsed = urlparse(link)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or any(c.isspace() for c in link):
            raise ValueError("Enter a valid web link beginning with http:// or https://.")
        if Path(output).suffix.lower() != ".png":
            raise ValueError("Save the QR code with a .png extension.")
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size={"Small": 6, "Medium": 10, "Large": 16}[settings.get("size", "Medium")],
            border=8 if settings.get("border", "Standard") == "Standard" else 4,
        )
        qr.add_data(link)
        try:
            qr.make(fit=True)
        except DataOverflowError as exc:
            raise ValueError("This link is too long for a QR code. Use a shorter link.") from exc
        image = qr.make_image(fill_color="black", back_color="white")
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        image.save(output)
        return f"QR code saved to {output}"

    def do_metadata(self, files, output, settings):
        from pypdf import PdfWriter
        reader = self._reader(files[0])
        writer = PdfWriter()
        writer.clone_document_from_reader(reader)
        metadata = {
            "/Title": settings["title"], "/Author": settings["author"],
            "/Subject": settings["subject"], "/Keywords": settings["keywords"],
        }
        writer.add_metadata(metadata)
        writer.write(output); writer.close()
        return "PDF metadata was updated."


def packaged_self_test():
    """Exercise modules that must be present in the standalone executable."""
    import pypdfium2 as pdfium
    from PIL import Image as PillowImage
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas

    with tempfile.TemporaryDirectory(prefix="rabpdf_selftest_") as folder:
        app = object.__new__(PDFStudio)
        qr_path = Path(folder) / "qr.png"
        app.do_qr([], str(qr_path), {"link": APP_WEBSITE})
        with PillowImage.open(qr_path) as qr_image:
            if qr_image.width != qr_image.height:
                raise RuntimeError("QR generator self-test failed")
        source = Path(folder) / "source.pdf"
        pdf = canvas.Canvas(str(source))
        pdf.drawString(72, 720, "RabPDF packaged self-test")
        pdf.showPage()
        pdf.save()

        reader = PdfReader(source)
        if len(reader.pages) != 1:
            raise RuntimeError("PDF reader self-test failed")

        rendered = pdfium.PdfDocument(str(source))
        bitmap = rendered[0].render(scale=1)
        image = bitmap.to_pil()
        if not isinstance(image, PillowImage.Image) or image.width < 1:
            raise RuntimeError("PDF renderer self-test failed")
        bitmap.close()
        rendered.close()

        encrypted = Path(folder) / "encrypted.pdf"
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        writer.encrypt("rabpdf-test", algorithm="AES-256")
        writer.write(encrypted)
        writer.close()
        if not PdfReader(encrypted).is_encrypted:
            raise RuntimeError("Encryption self-test failed")
        tiny = Path(folder) / "tiny.png"
        PillowImage.new("RGBA", (8, 8), (80, 120, 160, 200)).save(tiny)
        upscale = Path(folder) / "upscaled.png"
        app.do_image_upscale([str(tiny)], str(upscale), {"scale": "3x", "format": "PNG", "engine": "AI reconstruction"})
        with PillowImage.open(upscale) as image:
            if image.size != (24, 24): raise RuntimeError("AI model self-test failed")


def launch_app():
    if os.name != "nt":
        PDFStudio().mainloop()
        return
    import ctypes
    from ctypes import wintypes
    api = ctypes.WinDLL("kernel32", use_last_error=True)
    api.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    api.CreateMutexW.restype = wintypes.HANDLE
    api.CreateEventW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
    api.CreateEventW.restype = wintypes.HANDLE
    api.SetEvent.argtypes = [wintypes.HANDLE]
    api.CloseHandle.argtypes = [wintypes.HANDLE]
    api.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    event = api.CreateEventW(None, False, False, "Local\\RabPDF.Activate")
    mutex = api.CreateMutexW(None, False, "Local\\RabPDF.Instance")
    existing = ctypes.get_last_error() == 183
    if not event or not mutex: raise ctypes.WinError(ctypes.get_last_error())
    try:
        if existing:
            api.SetEvent(event)
            return
        app = PDFStudio()
        def activate():
            if api.WaitForSingleObject(event, 0) == 0:
                app.deiconify(); app.lift()
                app.attributes("-topmost", True)
                app.after(100, lambda: app.attributes("-topmost", False))
                app.focus_force()
            app.after(150, activate)
        app.after(150, activate)
        app.mainloop()
    finally:
        api.CloseHandle(mutex); api.CloseHandle(event)

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        packaged_self_test()
    else:
        launch_app()
