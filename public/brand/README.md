# Heis logo

The sculpted H joins two pillars with a rising diagonal bridge. The clipped outer corners give the mark a precise silhouette. The lowercase wordmark uses optically spaced DM Sans at weight 560, exported entirely as vector outlines.

## Revision 02

The separate lockup now uses a 16-unit visible gap, with the symbol and lettering aligned to the same 12-to-88 vertical bounds. The integrated alternative replaces the first letter with the H symbol and uses an 8-unit gap before `eis`. Both use the same lettering scale and baseline.

Compare them in `heis-logo-comparison.png` or `comparison.html`. `heis-integrated.svg` is the two-color integrated wordmark; `heis-integrated-black.svg`, `heis-integrated-ivory.svg`, and `heis-integrated-crimson.svg` are single-color alternatives. Neither alternative has been applied to the application.

## Files

- `heis-lockup.svg`: crimson symbol and ivory wordmark, for dark backgrounds.
- `heis-lockup-black.svg`: single-color dark lockup, for light backgrounds.
- `heis-lockup-ivory.svg`: reversed single-color lockup.
- `heis-symbol-*.svg` and `heis-wordmark-*.svg`: separate symbol and lettering in crimson, ivory, and black.
- `heis-app-icon-crimson.svg`: recommended app icon, ivory on crimson.
- `heis-app-icon.svg`: alternate app icon, crimson on charcoal.
- `heis-app-icon-1024.png`: 1024px PNG of the recommended icon.
- `heis-logo-board.png` and `preview.html`: presentation and size comparisons.

Use the symbol at 16px or larger and the full lockup at 100px or larger. Keep clear space of at least one pillar width around the symbol. Do not stretch, add shadows to the mark itself, or change the diagonal angle. Use the ivory or black version when stronger contrast is needed.

Colors: crimson `#AC2430`, ivory `#F5EEE6`, charcoal `#101113`.

`heis.studio` is the proposed address, not part of the primary logo. Domain availability and trademark clearance have not been checked. These are design assets; existing application branding has not been replaced in this step.

Regenerate the SVG files with `python scripts/generate-brand.py` after installing `fonttools` and `brotli` into a temporary Python environment. Font license: `../fonts/DM-Sans-LICENSE.txt`. No font installation is required to use the outlined SVG files.
