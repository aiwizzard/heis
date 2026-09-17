# Heis identity

The approved wordmark replaces the first letter with the sculpted H, followed by outlined `eis`. Geometry, spacing, and alignment are identical in both themes. Lettering uses DM Sans weight 560, converted to vector paths.

## Production assets

- `heis-wordmark-light.svg` and `.png`: deep crimson H with charcoal lettering for light backgrounds.
- `heis-wordmark-dark.svg` and `.png`: brighter crimson H with ivory lettering for dark backgrounds.
- `heis-symbol-light.svg` and `.png`: standalone crimson H.
- `heis-symbol-dark.svg` and `.png`: standalone ivory H.
- `heis-app-icon-crimson.svg`, `heis-app-icon-1024.png`: app thumbnail, ivory H on deep crimson.
- `heis-icon-{size}.png`: 16, 24, 32, 48, 64, 128, 180, 192, 256, 512, and 1024 pixels.
- `heis-favicon.svg`: browser tile. Root public also contains favicon.svg, multi-resolution favicon.ico, apple-touch-icon.png, and site.webmanifest.
- `heis-maskable.svg` and 192/512 PNGs: full-bleed install icons with safe padding.
- `heis-social.svg` and `.png`: 1200 by 630 social sharing card.
- `../../build/heis.icns`, `heis.ico`, `heis.png`: macOS, Windows, and Linux packaging icons.
- `identity.html` and `heis-identity.png`: current identity presentation.

Use `HeisBrand` for application headers, passing the actual surface theme. The desktop follows its theme selector; the landing page and hosted account pages use dark branding. Favicons and native icons share an ivory-on-crimson tile for stable contrast in either operating system theme. The icon does not change with the app theme.

Keep the wordmark at least 56px wide in compact application chrome and 100px wide in presentations and the symbol at least 16px high. Preserve its aspect ratio and leave clear space around it. Do not add shadows to the mark itself. Historical lockup, integrated, comparison, and plain-lettering files remain design explorations; use the explicit light/dark filenames in new UI.

## Regeneration

Run `python scripts/generate-brand.py` with fonttools and brotli installed, then `npm run brand:export`. The export script rasterizes assets, creates ICO and (on macOS) ICNS, and synchronizes hosted web public assets. Commit the exports together with source changes. Font license: `../fonts/DM-Sans-LICENSE.txt`.

Sharing metadata defaults to https://heis.studio. Set NEXT_PUBLIC_SITE_URL to the deployed origin when hosting either web surface.

The proposed domain is heis.studio. It is separate from the wordmark; this asset kit does not configure or publish a domain.
