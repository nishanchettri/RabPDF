"""Bounded, manual vertical curve correction using Pillow's mesh resampler."""
import math
from PIL import Image


def do_book_flatten(self, paths, output, settings):
    top = float(settings.get("top", 0)) / 100
    bottom = float(settings.get("bottom", 0)) / 100
    if not all(math.isfinite(value) and abs(value) <= 0.25 for value in (top, bottom)):
        raise ValueError("Curve correction must be between -25% and 25%.")
    with Image.open(paths[0]) as source:
        if source.width * source.height > 12000000:
            raise ValueError("Flattening supports up to 12 million pixels.")
        image = source.convert("RGB")
    width, height = image.size
    if top == bottom == 0:
        result = image
    else:
        def curve(x):
            s = x / width
            return 4 * s * (1 - s)

        mesh = []
        for left in range(0, width, 16):
            right = min(width, left + 16)
            # The same source column is stretched vertically between its two curves.
            quad = (left, height * top * curve(left),
                    left, height * (1 + bottom * curve(left)),
                    right, height * (1 + bottom * curve(right)),
                    right, height * top * curve(right))
            mesh.append(((left, 0, right, height), quad))
        result = image.transform(image.size, Image.Transform.MESH, mesh,
                                 resample=Image.Resampling.BICUBIC, fillcolor="white")
    result.save(output, format="PNG")
    return "Manual curve correction ready."
