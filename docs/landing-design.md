# Heis landing design

The landing page positions Heis as a desktop workspace for AI video, with supporting image, audio, and lip-sync tools. Deep crimson, charcoal, warm ivory, DM Sans, and restrained serif emphasis connect the marketing page to the desktop identity.

## Shared implementation

`components/LandingPage.tsx` and `components/landing.css` are the source of truth for both the original Next.js route and the standalone `apps/landing` marketing app. The standalone component re-exports the shared component. Avoid copying its markup or CSS into a second implementation.

The page has a responsive hero, a three-studio screenshot tour, a connected workflow, Cinema Studio camera references, local/cloud explanations, native FAQ disclosures, and a download section. Short entrance animations, one-time scroll reveals, studio crossfades, and pointer hover effects add motion. Reduced-motion preferences disable decorative animation, and all content remains visible when JavaScript is unavailable. Repeated section eyebrows and duplicate captions are intentionally omitted. Preview selection uses buttons with pressed states; FAQ controls support keyboard activation. All fragment links target real sections.

## Release configuration

- `NEXT_PUBLIC_SITE_URL`: public marketing origin for social metadata.
- `NEXT_PUBLIC_ACCOUNT_URL`: account destination, default https://app.heis.studio/account.
- `NEXT_PUBLIC_MAC_DOWNLOAD_URL`: set to the published HTTPS Apple silicon installer URL to enable the download link. Until then, show the public-release preparation state. Rebuild after changing these public variables.

Do not substitute a local package path or an unverified release URL. No installer is published by the landing build.

## Claims and imagery

The studio screenshots are real desktop captures from the native smoke checks, encoded as WebP. The camera images are existing Cinema Studio reference assets, explicitly labeled as references, not generated customer output. No testimonials, generated-output claims, or unverified model counts are added.

The page describes the current generation tools. It does not promise an available timeline editor or a fully offline cloud workflow. Generation costs are explained without publishing unconfigured plan prices. Current release status and system requirements must be updated with the installer release.

The checked-in screenshots and references live in `public/assets/landing` and are mirrored in `apps/landing/public/assets/landing`. DM Sans and its license are mirrored into the standalone app. When refreshing previews, capture the real app without private account information, convert to WebP, and update both copies.

## Validation

Check both Next.js production builds and the desktop renderer build after changing the shared stylesheet. The page was checked at 1440, 768, 390, and 320 pixels for overflow; all preview selections, FAQ keyboard activation, anchors, image loads, and the unreleased download state were verified in Electron Chromium. Screenshots are in the ignored `test-results/landing-*` files.
