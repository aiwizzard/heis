# Editor Studio

The desktop app now has an opt-in project editor alongside the existing standalone studios. Editing and export remain local and do not require a Heis subscription. Managed generation continues to use existing entitlements and billing.

## Run it

Use Node 22.12 or newer. On a matching Apple Silicon or Intel Mac:

```sh
npm run build:media-runtime
HEIS_EDITOR=1 npm run desktop:dev
```

The first command builds pinned FFmpeg 8.0 and whisper.cpp 1.7.6 sources, checks archive hashes, and stages architecture-specific binaries, source archives, and licenses. It requires Xcode command-line tools, CMake, and Make. Packaged applications use those binaries without development dependencies. macOS VideoToolbox supplies H.264 encoding; the FFmpeg build does not enable GPL components.

Automatic captions download the multilingual Whisper base model on first use, validate the upstream model checksum, and subsequently run offline. Model download cancellation removes partial files. For development, the runtime paths can be overridden with `HEIS_FFMPEG_PATH`, `HEIS_FFPROBE_PATH`, `HEIS_WHISPER_PATH`, and `HEIS_WHISPER_MODEL`.

`HEIS_EDITOR=1` changes `/studio` to Projects. Explicit legacy routes such as `/studio/video` still open their standalone studio. The release default remains unchanged until the release gates below are completed.

## Architecture and behavior

- `packages/editor` contains the React workspace, preview, timeline interactions, compact generation panel, and tool registry. Shared editor types, command validation, subtitle conversion, frame planning, and text painting live in `@heis/core` so both Electron and the renderer use the same contracts.
- `electron/editor` owns project revisions, undo/redo, filesystem access, media analysis, jobs, transcription, and export. The narrow `heisEditor` preload bridge uses the existing trusted-origin IPC checks.
- Each project folder contains `project.heis.json`, copied `media/`, derived `cache/`, `recovery/last-good.json`, and `jobs.json`. Autosave is debounced by one second, uses atomic replacement, and flushes when leaving or closing the project. Newer schema versions are rejected. Workflow projects keep their existing store and APIs.
- Preview combines media elements, Canvas, and Web Audio. Export compiles transforms and timing into FFmpeg filters, rasterizes text using the same painter and bundled font, snapshots the project, and writes a temporary MP4 before finalizing. Cancelling an export preserves an existing destination.
- Generation submission captures its destination project before awaiting the provider. Persistent polling and downloaded assets survive studio unmounts and project switches. A local standalone library receives creations made outside projects. Library assets can be copied into a project.
- Project-aware studio workspaces receive selected source media. Outputs enter the library without replacing timeline content. Shorter replacements require trimming confirmation, and linked audio must be detached before replacing its video.
- The optional assistant is bound to the project directory. MCP exposes project state, selected clips/playhead, revision-checked edit batches, job status, managed generation, and export. Manual and assistant edits share undo/redo.
- Image layer decomposition uses managed Qwen Image Layered with ordered transparent PNG outputs. The updated hosted service must be deployed alongside this desktop build. AI clipping provides local transcription, managed transcript-based ranking, and reviewed local clip creation. Design Agent now provides project-local reference boards, managed image tools, scoped agent conversations and explicit timeline insertion. Workflow execution remains gated. See `docs/design-agent.md`. See `docs/ai-clipping.md` for limits and deployment requirements. Their UI registration does not claim completed provider support.

## Validation

```sh
npm run typecheck:editor
npm test
npm run test:agent
npm run build:desktop-renderer
npm run build:electron
npm run test:editor-desktop
npm run test:desktop
```

The editor smoke test launches Electron with isolated user data and no subscription, imports a real media fixture, adds linked video/audio, titles and captions, exports, compares preview and output frames, and reopens the saved project. It writes `test-results/editor/editor.png`. Set `HEIS_KEEP_TEST_ARTIFACTS=1` to retain its temporary project and exported MP4.

Automated core tests cover stale revisions, linked edits, source limits, locked tracks, ripple deletion, subtitle round trips, frame boundaries, project recovery, portable folders, library isolation, and asset-path confinement.

## Release gates still required

- Verify a signed, notarized packaged build on a clean Mac, and build/test the matching Intel runtime on an Intel Mac.
- Measure the specified ten-minute, three-video-layer/four-audio-track workload on the target 16 GB hardware. The short native smoke test is not that performance benchmark.
- Run authenticated provider tests for generation, uploads, billing, cancellation, and reconnect recovery. Local fixtures do not establish cloud-service availability.
- Complete each currently gated studio's provider implementation before enabling it.
- After these checks, enable the editor by default and update public onboarding and marketing screenshots. Until then, the existing public-release claims remain accurate.

Current boundaries: one cross-dissolve style, static titles, fixed project frame rate after clips are added, and macOS MP4 export. No cloud project synchronization, collaboration, nested sequences, keyframe editor, or advanced color tools are introduced.

## Development verification, 2026-09-19

- Strict editor typechecks and 56 unit tests passed, plus five agent lifecycle tests.
- Both the new editor smoke test and the existing ten-studio desktop smoke test passed.
- Real local speech transcription passed with the pinned Whisper runtime and verified base model. `npm run test:editor-captions` repeats that check; set `HEIS_WHISPER_MODEL` to reuse a downloaded model.
- The higher-resolution fixture revealed an implicit color-matrix mismatch. Imports, proxies, and export now carry explicit color handling, and the first-frame RGB comparison passes.
- An eight-second workload sample with a ten-minute project, 1,400 clips, three video layers, and four audio tracks measured approximately 30 timeline updates per second. Run with `HEIS_EDITOR_BENCHMARK=1 npm run test:editor-desktop`. This measures UI advancement, not decoded-frame completeness or sustained thermal performance.
- The Apple Silicon runtime is built locally. Intel and clean-machine distribution checks remain release work.


The unpublished Apple Silicon app bundle also passed the editor smoke test using its packaged media runtime, without FFmpeg path overrides. This verifies packaged resource loading on the development Mac; it does not establish notarization or clean-machine compatibility. `npm run desktop:editor` is the shortcut for enabling the preview.
