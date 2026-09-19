# Workflow Studio

Open a project, choose Tools, then Automation workflows. The standalone `/studio/workflows` route uses the local library. Editing and local composition work without a Heis subscription. Managed generation uses existing entitlements, upload rules, pricing and native spending approval.

## Nodes and templates

- Project image, video and audio inputs reference portable project media. Text inputs and concatenation produce persistent text results.
- Managed nodes expose Heis image generation/editing/upscale/background removal/expansion/layers, video generation/transformation/marketing/motion control/recast/motion graphics, lip sync, speech, music and text generation. Capability-specific controls and typed input menus prevent invalid connections.
- Text output can feed a generation prompt. Multiple media inputs have ordered ports. Output indices select individual layers or other provider results, starting at zero.
- Local video combining normalizes clips to 1280 × 720 at 30 fps, fits without stretching, mixes source audio at 48 kHz stereo, supplies silence where absent, and joins clips in order. It produces a new H.264/AAC asset using packaged FFmpeg.
- Output nodes expose assets or text. Text can be downloaded. Media remains in the project until explicitly added to the timeline or used to replace a clip. Audio insertion uses audio tracks. Replacement preserves placement and transforms, rejects incompatible media and requires an explicit trim choice for shorter results.

Templates cover image edit/animation, prompt writing/image generation, speech, music, local video combining, layers and lip sync. Start from a template or assemble a graph with Add node. Drag headers to arrange nodes. Graphs must be acyclic, all ports must match, and every node must reach an output. Maximum 50 nodes, 20 ordered media inputs, 16,000 prompt characters (speech 5,000 and music 2,000).

Save before switching workflows. Saved graph edits, including assistant edits, have persistent undo/redo with monotonic revision checks. Up to 50 graph edits are retained. Runs always use immutable graph snapshots.

## Migration

Import modern graph JSON or review an earlier workflow from the preserved legacy store. Migration always creates a separate copy. The review lists model substitutions and allows explicit managed replacements, including legacy arbitrary API nodes. Credentials, remote input URLs, run history and spending approvals are never imported. Relink media to local project assets after importing.

Old provider-specific settings are not silently replayed. Review the new model and its controls. Incompatible legacy wiring reports an error; choose a compatible replacement or adjust the original graph. Old records can still be inspected and downloaded unchanged. Arbitrary third-party endpoint execution is not supported; all remote workflow operations use the Heis managed catalog.

## Assistant

The optional Workflow assistant reuses the existing Codex conversation runtime and login. Conversations are scoped to the originating project and workflow. It can inspect current state/capabilities/assets, save complete validated graphs, run with native approval, and cancel runs. Graph edits reject stale revisions and are undoable. The assistant has read-only filesystem access, receives workflow-specific instructions, and cannot use general timeline edit/export/generation tools in this scope. Media insertion stays under the user's control.

Assistant graph updates appear automatically when the local draft is clean. A dirty draft remains intact and reports a revision conflict; export the draft or discard it before reloading.

## Execution, recovery and spending

Each project stores `workflows/<id>.json`, containing its definition, graph history, immutable runs, node requests, provider IDs, local jobs, output asset IDs and text. Atomic writes protect saves. Downloaded media is durable before downstream processing. Run history is bounded by a 20 MB file limit; create a new workflow when reached.

Requests and billing idempotency keys persist before provider submission. Ambiguous responses reuse the original request and key; confirmed provider failures receive fresh requests only after approved retry. Successful upstream nodes are reused. Cancel stops downstream submissions and requests cancellation of active remote or local jobs. Accepted provider work may already be billable.

Pending jobs recover when their project reopens. Local composition interrupted by restart reports failure and can be resumed without paid work. A local approval ledger verifies run snapshots before continuation. Transferred or altered runs cannot trigger spending automatically. Results never move to another project when the user switches workspaces.

Upload limits remain 20 MB per image and 500 MB per audio/video file. Workflow outputs are reusable assets, not generated timelines. Highlight analysis remains in the Clipping workspace because it requires transcription and source-range review.

## Verification and deployment

Run `npm run typecheck:editor`, `npm run typecheck:agent`, `npm run typecheck -w @heis/web`, `npm test`, `npm run test:agent`, `npm run test:workflow-hosted`, desktop builds, and `npm run test:workflow-desktop`. Existing editor, design and desktop smoke suites cover integration regressions.

Tests cover every managed request mapping and template, typed graph validation, migration sanitization, stale graph revisions, persistent undo, text/speech output, ambiguous submissions, download failure, restart, cancellation, project switching and explicit timeline insertion. A real packaged FFmpeg test checks mixed frame rates, portrait fitting, source order, audio and silence, and duration within one frame. Electron smoke covers assistant tools, blocked timeline edits, stale assistant saves, templates and reviewed migration with mocked paid providers.

Deploy the hosted API/webhook changes before enabling the new `heis-text-standard` capability in a distributed desktop build. Live provider availability, quality and final billing require authenticated acceptance. Automated tests spend no provider credits.
