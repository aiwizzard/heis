# Desktop migration from Sai

Heis is the continuing product repository. Sai remains the small reference implementation. The migration preserves Heis media studios, licensing, encrypted credentials, local inference, generation providers, project storage, and hosted services while adopting Sai's static renderer and persistent Codex architecture.

## Runtime

- Electron loads compiled React assets over the private `heis-app://app` protocol. There is no Next.js desktop server or renderer listening port.
- Ten active media studios load as separate chunks. The initial JavaScript bundle is about 266 kB, 82 kB gzipped. These are build sizes, not measured startup or memory benchmarks.
- The renderer uses a sandboxed preload with context isolation. Privileged IPC checks the calling main frame and origin.
- Codex starts on demand from the bundled runtime. Its stdio app-server connection persists projects, conversations, drafts, model selection, approvals, and interrupted-turn state in the Electron user data directory.
- Heis MCP uses a token-protected loopback bridge. Codex receives the bridge environment explicitly. Media generation retains Heis spending approval and entitlement checks.
- The root Next.js preview and `apps/web` account/API application retain independent builds.

## Development and packaging

Use Node 22.12 or newer. Run `npm install`, then `npm run desktop:dev` for Vite hot reload or `npm run electron:dev` for the compiled renderer.

`npm run electron:build:arm64` produces the Apple Silicon app and DMG. Use a matching host for other targets, or install its matching Codex optional runtime package first. Packaging validates the target architecture. Codex helpers ship alongside the executable; end users do not need Node, npm, or a separate Codex installation.

A local build can use `HEIS_SKIP_NOTARIZE=1 CSC_IDENTITY_AUTO_DISCOVERY=false`. Distribution builds require Apple signing and notarization credentials. Hosted authentication and billing retain the environment configuration in `.env.example` and `apps/web/.env.example`.

## Validation

- `npm test`: 42 existing contracts, storage, media-helper and inference tests.
- `npm run test:agent`: five Codex lifecycle tests covering persistence, resume, approvals, questions, stop, process failure, authentication, and RPC timeout.
- `npm run typecheck:agent`: strict checking of the new agent service. The legacy root configuration still uses `noCheck`; its typecheck command does not establish full type safety.
- `npm run test:desktop`: native Electron smoke test with an isolated, signed test entitlement and a deterministic Codex fixture. Opens all ten active studios and exercises conversation approvals, input, persistence, and stop.
- Set `HEIS_TEST_EXECUTABLE` to a packaged executable to test the installed layout.
- Set `HEIS_TEST_REAL_CODEX=1` for an opt-in real account check that calls only `heis_project_info`. It does not generate paid media.
- `npm run build` and `npm run web:build`: both Next.js build paths.

Tests create temporary user data and do not modify production entitlement policy. No paid generation or real local model inference is included in this verification.

Verified on 2026-09-16: the Apple Silicon packaged app passed native smoke checks. The bundled Codex 0.154.0 runtime used the existing account with GPT-6-Astra and successfully called `heis_project_info` once, returning `available: true`. Both web builds and all tests above passed.

## Existing product boundaries

This migration completes the desktop architecture consolidation. It does not turn preexisting placeholders into finished features: general timeline/project export remains unconnected to the agent, some studios are gated, local FFmpeg and model assets need provisioning, and commercial services require configured accounts and credentials. These are product implementation or deployment tasks beyond replacing the desktop foundation. They must be resolved before claiming the entire media product is production ready.
