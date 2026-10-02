# Android scanning preview 0.4.0

This is an original RabPDF workflow, not copied CamScanner code or artwork.
All scanning and editing tools remain free. Desktop 1.4.1 is unchanged.

## Included workflows

- Document scan: native Google ML Kit capture, automatic detection, perspective
  correction, crop, filters and cleaning; then page review and multipage export.
- ID card scan: exactly two reviewed sides, front/back crop and enhancement,
  arranged on one A4 page in stacked or side-by-side layout.
- Book scan: scan/import a spread, adjust the gutter, split left/right pages,
  crop, straighten, enhance, and optionally apply manual curvature correction.
- QR scan: native QR camera or bundled image decoder. Display contents before
  opening; only HTTP/HTTPS without embedded credentials get an Open link action.
  This is not a phishing detector. Non-web payloads can be copied, not executed.
- Sign PDF: draw/undo/clear strokes or import PNG/JPEG; select a page, drag the
  signature and adjust size. Placement accounts for page rotation and crop box.
  This adds a visual image, not a cryptographic certificate-based signature.
- Page reorder: page thumbnails, touch-friendly drag handles, up/down fallback,
  quarter-turn rotation, delete, and undo. PDF pages are not rasterized.

## Curve flattening: what it actually does

The book editor has two manual curve adjustments after splitting a spread.
They resample existing pixels using Pillow's bicubic mesh transform. There is
no generative image model, OCR-based reconstruction, or automatic 3D recovery.
Use zero for unchanged geometry; Reset flattening restores both values to zero.

For normalized horizontal coordinate s and output row v, the source row is:

    f(s) = 4s(1-s)
    y_source/H = v + ((1-v)a + vb) f(s)

a and b are the top/bottom slider values divided by 100, restricted to [-0.25,
0.25]. For a fixed column the mapping is linear in v. Its derivative is:

    d(y_source/H)/dv = 1 + (b-a)f(s) >= 1 - 0.5 = 0.5

Thus columns do not fold over within the supported range. The library resamples
16-pixel strips. A synthetic curved-line test checks that the corresponding
known warp is straightened; it does not establish accuracy on arbitrary books.
This model only approximates smooth vertical bowing. It does not correct
horizontal foreshortening, complex folds, occluded text, or missing detail.
Out-of-image samples become white. Always inspect the preview before export.

## Saving and privacy

Android uses document-provider URIs, which are not necessarily disk paths.
For internal-storage providers, RabPDF shows the reported location. Otherwise
it says Android-selected document location instead of inventing a folder.
Open file opens the saved document; Browse files opens Android's document
picker with that URI as a starting hint. Providers may ignore this hint.

Recent receipts retain at most five names, locations, and granted URIs in local
app storage. No documents are copied into that history. Access may expire, or
files may move. Open failures report that possibility. Camera scan cache copies
are deleted after import; temporary save/share copies can remain in app cache.

The toolbar and Android back button warn about unsaved scan/edit changes.
No account, RabPDF server, or automatic QR link opening is involved.

## Limits and remaining verification

Imported photos: <=20 MB each, <=40 million input pixels, <=100 MB total. Edited
images are downsampled to a 2400-pixel long edge and <=12 million pixels.
Document reviews support up to 30 pages; book reviews/exports up to 60 pages.
PDF signing/reorder: <=80 MB and <=200 pages; encrypted files must be unlocked
first. Editing already digitally signed PDFs invalidates their signatures.
Bookmarks, forms, and annotations that refer to deleted pages need review.

Native scanning needs Google Play services and may download its module on first
use. Document scanning requires >=1.7 GB device RAM. Imported-image editing is
available when the native scanner is unsupported or unavailable.

Camera runtime, Google Play module setup, provider permissions, real-device
touch behavior, rotation, low memory, and live ads still require physical-phone
QA. Browser tests and successful compilation cannot prove those paths.

## Primary references

- https://developers.google.com/ml-kit/vision/doc-scanner/android
- https://developers.google.com/ml-kit/vision/doc-scanner
- https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner
- https://pdf-lib.js.org/
- https://pillow.readthedocs.io/en/stable/reference/Image.html
