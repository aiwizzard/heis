# Design Agent

Open a video project, select Tools, then Design agent. The standalone `/studio/design-agent` route stores outputs in the local library.

## Workflow

1. Name a board, set its brief, colors and canvas size.
2. Import image references, choose existing project images, or extract a timestamped frame from project footage. Drag cards to arrange them. Boards are saved immediately in the project's `designs/` folder.
3. Enable chat to share the selected reference images with the agent using the existing Codex login or optional API key. Conversations stay bound to that project and board. The agent can inspect the board and use its generation tools. It cannot use Heis timeline mutation tools from a design conversation.
4. Use chat or direct controls for generation, reference-based editing, upscale, background removal, expansion or layer separation. Native approval shows the credit reservation and reference upload notice before any paid submission or upload. Existing entitlements, hosted validation and billing still apply.
5. Results download into the originating project's media folder. Pending jobs continue when switching boards or projects, and resume after restart. Repeated completion events do not add duplicate cards. Network/download interruptions use the existing reconnect loop; terminal provider failures remain visible. Resubmitting a failed generation requires a new approval.
6. Inspect a result and compare it with another image. Add it at an explicit frame/duration or replace a chosen video/image clip. Replacement preserves duration, transforms and linked audio. Both actions use the editor's revision-checked undo history. Nothing is inserted automatically.
7. Return to the editor, save/reopen and export normally. Standalone results can be copied from the local library into a project.

## Implementation

`packages/core/src/design.ts` defines typed contracts. `electron/editor/designStore.ts` owns versioned local boards, validation and timeline commands. `DesignWorkspace.tsx` displays the board and embeds the existing conversation UI. The trusted agent bridge prepares local image attachments and applies a read-only Codex sandbox with design instructions. MCP tools `heis_design_info` and `heis_design_generate` derive their project and session from the active conversation, never from model-supplied destination IDs. Generic project/job reads are similarly bound during design turns.

Existing managed capabilities provide images and image operations. No separate Design Agent provider or API key is introduced. Layer separation needs the hosted Qwen integration already documented in `docs/image-layers.md`. This is a raster asset workspace; text rendered inside generated images is not native editable typography. Editor titles remain the tool for editable text.

## Verification

Run `npm run typecheck:editor`, `npm run typecheck:agent`, `npm test`, `npm run test:agent`, then build Electron and the desktop renderer and run `npm run test:design-desktop`.

The native smoke uses mocked paid providers and the mock Codex runtime, but real project storage, image import, local downloads, timeline commands and MP4 export. It covers declined and approved generation, a reference-based MCP agent tool call, blocked automatic timeline mutation, board switching, explicit insert/replace and export. Unit tests cover stale revisions, foreign asset rejection, schema preservation, job association/deduplication, undo and reference attachment/runtime scope.

Authenticated live-provider quality, billing and clean-machine packaged-app checks remain release validation. The smoke test does not spend credits or establish provider availability.
