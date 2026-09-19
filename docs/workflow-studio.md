# Workflow Studio: first supported execution path

Open a project, choose Tools, then Automation workflows. The standalone `/studio/workflows` route uses the local library.

## Supported workflow

Project image → image edit → image-to-video → output.

Choose an imported image, write the image-edit and motion prompts, and choose a 5- or 10-second video. Review and run saves the graph, validates all connections, and asks for native approval before uploading references or submitting paid work. The approval shows the remaining credit reservation and prompts.

The canvas supports adding and removing these four node types, changing connections through input menus, and dragging nodes to arrange them. Graphs must be acyclic, connections must have compatible media types, and every node must lead to an output. Execution follows dependency order, one node at a time. Branches can share an upstream result. Processing nodes use the first output of their source; all returned outputs remain available in the project.

Runs retain immutable graph snapshots. Editing the canvas cannot change an in-progress run. Intermediate images and final videos download into the originating project's media folder. Preview uses a local proxy when necessary. Results remain in the library until the user explicitly adds or replaces a timeline clip. Insertion is undoable. Replacement preserves visual properties, requires detached audio, and requires an explicit trim choice for shorter videos.

## Recovery and spending

Each workflow is stored under `workflows/<id>.json` inside its project. It contains its definition, run history, per-node state, provider job IDs and exact submitted requests. The request and billing idempotency key are saved before submission. A lost submission response is retried with the same request and key. A confirmed provider failure gets a new request only after another approval. Completed upstream steps are reused.

Known pending provider jobs resume when their project is reopened. Downloads complete locally before a downstream node can run. A network, upload or download failure leaves an actionable failed run; Review and resume retries remaining work. Cancel stops downstream submissions and requests cancellation of an active provider job. Cancellation cannot guarantee a refund for already accepted work.

A separate local approval ledger verifies each saved run before automatic continuation. Moving a project on the same installation retains that approval. A transferred project or changed run without matching local approval cannot trigger spending automatically. Its results remain available; starting a new run requires approval. This ledger is not copied into the portable project.

## Compatibility and remaining scope

Existing workflow records remain untouched in the earlier workflow store. The workspace lists them under Earlier workflows and lets users inspect and download the original graph. They are not automatically reinterpreted or executed.

Only the four supported node types are enabled. Legacy arbitrary API nodes, video-combining nodes, audio nodes, legacy template migration, and the workflow-building assistant remain future work. This release provides the first complete managed workflow, not support for every legacy node or model. Workflow outputs are assets, not automatic timeline edits or generated sequences.

The runner reuses the existing managed image-edit and image-to-video capabilities. It adds no separate provider key or workflow server.

## Verification

- `npm run typecheck:editor`
- `npm test`
- `npm run build:desktop-renderer && npm run build:electron`
- `npm run test:workflow-desktop`

Unit tests cover connection validation, stale revisions, immutable graphs, ambiguous submissions, download retries, downstream failures, restart recovery, cancellation, local approval provenance and undoable insertion. The Electron smoke uses mocked paid services with real import, probing, proxy creation, downloads and MP4 export. It also verifies cancellation and resume without repeating a successful upstream generation.

Live provider availability, quality and billing still require authenticated validation. The automated acceptance flow spends no credits.
