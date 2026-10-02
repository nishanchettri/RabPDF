# Windows 1.4.1 / Android 0.3.1

- Chevron icons replace text arrows in tool groups.
- Clearer active-tool states and single/batch controls.
- More consistent spacing, focus styling, and phone touch targets.
- Desktop mouse-wheel scrolling and automatically revealed tool groups.
- About window sizes to content, including at larger text scaling.
- Optional Windows folder edition avoids single-file runtime extraction.
- Android includes only the Lucide icons it actually uses.
- Small image files show KB or bytes instead of rounding to 0.0 MB.

The animated rabbit, credits, PDF compression presets, free access, and
optional Android ads are preserved. AI upscaling uses the same bundled ESPCN
model as the previous release; these changes do not upgrade model quality.

Local verification: 11 Python regression tests, packaged Windows self-tests,
single-instance launch checks for both editions, browser workflow checks at
320/390/768/1280-pixel widths, and Android release builds/unit tests.
Physical Android-device testing and live ad delivery remain unverified.

One startup check on the build machine measured approximately 14.4 seconds
for the single EXE and 8.0 seconds for the folder edition. These are individual
observations under build-machine load, not controlled benchmarks or promises.
