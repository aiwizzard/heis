# Image layers

Heis uses Runware's `alibaba:qwen-image@layered` through the existing managed generation service. One source image produces a layered TIFF. The hosted worker validates and splits its pages into ordered transparent PNGs, stores every output, then settles credits. Desktop jobs copy these outputs into their originating project or standalone library. Timeline insertion remains an explicit user action.

The Layers workspace supports PNG/JPEG/WebP import, 2 to 10 requested layers, optional separation guidance, individual layer previews and PNG downloads. Results can include an additional background layer. It does not promise exact masks or lossless reconstruction of the input.

## Deployment

Deploy the updated `@heis/core` catalog, `apps/web` API, and Trigger.dev worker before distributing the desktop build. The existing Runware key, storage, subscription, and credit configuration is reused; no new provider account is required. Sharp is an explicit pinned dependency and externalized in the worker build. No database migration is required.

Provider contract: https://runware.ai/docs/models/alibaba-qwen-image-layered
Sharp worker setup: https://trigger.dev/docs/guides/examples/sharp-image-processing

## Validation

- `npm test`: real multi-page TIFF extraction with pixel/alpha checks, invalid output rejection, request validation, webhook ordering, duplicate completion, partial-write recovery, cancellation, and credit release.
- `npm run typecheck -w @heis/web` and `npm run typecheck:editor`.
- `npm run build:desktop-renderer` followed by `npm run test:layers-desktop`: native desktop import, approval cancellation, successful results, selected-layer preview, actual PNG save, themes, and failure recovery using mocked paid-provider responses.

A paid live-provider run against the deployed hosted service has not been performed. Before release, verify a real source through generation, layer inspection, project save/reopen, and timeline export. The provider's public example TIFF URL returned 404 during implementation, so fixtures verify decoding without claiming live output quality.
