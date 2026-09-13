# Heis Product and Implementation Plan

Status: Foundation implemented, product migration and production release work remain

Last implementation update: 2026-09-13

### Current implementation boundary

The repository now contains the commercial platform foundation: shared contracts, the packaged Next.js renderer path, secure Electron services, Supabase schema and entitlement functions, hosted authentication and billing APIs, managed and customer-key Runware adapters, Trigger.dev background jobs, Codex app-server and local MCP integration, and macOS signing and update configuration. The desktop shell now uses Heis sign-in and encrypted provider-key setup instead of a renderer-stored MuAPI key. Image Studio, Video Studio, Lip Sync Studio, Cinema Studio, Audio Studio, Marketing Studio, and AI Influencer Studio use the provider-neutral bridge. The Agents tab has a native Codex app-server conversation UI with workspace-write sandboxing and approval handling. Other legacy studios are visibly gated until their provider migration is complete.

The product is not ready for paid distribution. Several gated studios and workflow nodes still contain legacy MuAPI modules, the curated Runware catalog covers only the first verified image and video capabilities, and the local project, timeline, FFmpeg export, and Codex export tools are not connected. Production services and credentials have not been provisioned. Apple signing and notarization have not been executed. The dependency audit has no high or critical production findings, but currently reports 13 moderate findings inherited through Trigger.dev 4.5.16 and its OpenTelemetry dependencies. These must be resolved or formally reviewed before release.

This document is the source of truth for the commercial Heis platform. Update the decision log and implementation checklist whenever product or architecture decisions change.

## Product contract

Heis is a proprietary, macOS-first AI creative desktop application. The editor and projects run locally. The hosted service supplies identity, commerce, entitlements, managed generation, job history, and temporary media recovery.

### Offers

| Offer | Price | Access | Generation |
| --- | ---: | --- | --- |
| Trial | Free | Full managed access for 14 days or 100 credits | Heis-managed Runware |
| Lifetime | $99 once | Perpetual use of Heis 1.x and its updates | Customer keys |
| Creator | $29 monthly | Full access while subscribed | 2,000 managed credits monthly, plus optional customer keys |
| Top-up | $10 once | Requires an active Creator subscription | 1,000 non-expiring credits |

One credit represents $0.01 of customer value. Managed generation charges `ceil(provider cost in USD * 200)` credits. The service reserves a catalog maximum before submission and reconciles the reservation against the final provider cost. Failed or cancelled work releases the reservation. Trial and monthly credits are consumed before purchased credits. Monthly credits do not roll over.

Each paid entitlement permits three active Mac installations. Installation identifiers are random UUIDs, never hardware fingerprints. A signed cached entitlement permits 30 days of offline local use. After a Creator subscription ends, users without a Lifetime entitlement retain read and export access. A Lifetime owner retains customer-key generation.

Existing MIT releases remain available under their existing terms. New commercial releases use a proprietary license. Marketing must not claim unrestricted or unfiltered generation because provider policies apply.

## Architecture

### Desktop

The complete Next.js studio is the only renderer. Electron starts a packaged Next.js standalone server on a random loopback port and loads `/studio`. The legacy Vite renderer is removed after feature parity is verified.

Electron main owns privileged operations:

- encrypted secret storage through Electron `safeStorage`
- Heis authentication refresh tokens and short-lived access-token delivery
- entitlement caching and installation activation
- Runware customer-key requests
- Codex app-server lifecycle and JSON-RPC
- local project and export operations
- local FFmpeg operations

The renderer runs with context isolation enabled and Node integration disabled. It receives a narrow typed IPC bridge. No provider key, Supabase service key, Stripe secret, or refresh token is stored in localStorage or exposed to renderer JavaScript.

### Hosted service

The hosted Next.js application runs on Vercel and supplies the landing page, Supabase sign-in callbacks, account management, Stripe Checkout, Stripe Customer Portal, and authenticated API routes. Supabase Postgres stores commerce and job state. Cloudflare R2 stores managed inputs and outputs. Trigger.dev owns durable managed workflows. Runware performs media inference.

Managed outputs are copied into R2, downloaded into the local project, and deleted from cloud storage after 30 days. Project timelines and source assets are not synchronized in version 1.

### Agent integration

Heis requires an installed Codex CLI in version 1. Electron discovers the executable, validates its version, and starts `codex app-server` over stdio. Users may authenticate Codex with their ChatGPT subscription or provide an OpenAI API key stored by `safeStorage`.

Heis starts app-server with temporary configuration overrides that register a local Heis MCP server without modifying the user's global Codex configuration. The MCP server exposes explicit generation, project, timeline, and export operations. Expensive and destructive operations require user confirmation.

The agent implementation sits behind `AgentProvider`, allowing a future Heis-managed OpenAI provider or Claude provider without studio changes.

## Shared interfaces

New application code uses strict TypeScript. Existing JavaScript is converted only when touched by the migration.

```ts
type BillingMode = "trial" | "managed" | "byok";
type JobStatus = "queued" | "submitted" | "running" | "succeeded" | "failed" | "cancelled";

interface BillingContext {
  mode: BillingMode;
  accountId: string;
  idempotencyKey: string;
}

interface GenerationRequest {
  operation: ModelCapability["operation"];
  modelId: string;
  inputs: Record<string, unknown>;
  billing: BillingContext;
}

interface GenerationJob {
  id: string;
  providerJobId?: string;
  status: JobStatus;
  reservedCredits: number;
  settledCredits?: number;
  outputs: MediaAsset[];
  error?: { code: string; message: string };
}

interface MediaProvider {
  listCapabilities(): Promise<ModelCapability[]>;
  submit(request: GenerationRequest): Promise<GenerationJob>;
  getJob(jobId: string): Promise<GenerationJob>;
  cancel(jobId: string): Promise<void>;
}

interface AgentProvider {
  getStatus(): Promise<AgentStatus>;
  startThread(input: AgentThreadInput): Promise<AgentThread>;
  send(threadId: string, input: AgentTurnInput): AsyncIterable<AgentEvent>;
  interrupt(threadId: string): Promise<void>;
}

interface WorkflowEngine {
  validate(definition: WorkflowDefinition): WorkflowValidation;
  run(definition: WorkflowDefinition, context: WorkflowContext): Promise<WorkflowRun>;
  cancel(runId: string): Promise<void>;
}
```

Studio components consume these interfaces and canonical operation schemas. Runware request fields remain inside the Runware adapter.

### Desktop IPC namespaces

- `auth`
- `entitlements`
- `secrets`
- `codex`
- `generation`
- `projects`
- `export`

Every IPC handler validates input and returns a serializable result envelope. The preload bridge exposes explicit methods rather than raw `ipcRenderer` access.

### Hosted API groups

- `/v1/account`
- `/v1/devices`
- `/v1/billing`
- `/v1/uploads`
- `/v1/generations`
- `/v1/jobs`
- `/v1/webhooks/stripe`
- `/v1/webhooks/runware`

Every mutation requires an idempotency key. Every customer resource is authorized against the Supabase access token. Stripe and Runware webhook handlers validate signatures, persist the event identifier, and commit effects atomically.

## Database model

- `profiles`: user identity and account metadata
- `subscriptions`: normalized Stripe subscription state and billing period
- `entitlements`: trial, lifetime, Creator, read-only, and expiry state
- `device_activations`: random installation ID, activation time, last check-in, and deactivation
- `trial_grants`: one verified-account trial with issuance and expiry
- `credit_wallets`: trial, monthly, and purchased balances
- `credit_ledger`: immutable grants, reservations, settlements, releases, expirations, and adjustments
- `generation_jobs`: canonical request metadata, provider identifiers, state, costs, and idempotency key
- `media_assets`: R2 object key, media metadata, ownership, and deletion deadline
- `processed_webhooks`: provider, event identifier, processing status, and timestamps

Row-level security prevents users from reading or changing another user's records. Service-role access is limited to backend processes. Credit mutation uses database transactions and row locking.

## Provider capability map

The first Runware catalog must include verified equivalents for:

- text-to-image and image editing
- text-to-video, image-to-video, and video transformation
- lipsync and motion control
- speech, music, and supported audio generation
- upscale, background removal, and image expansion
- design-agent and agent-requested generation

Deterministic editing such as trim, combine, overlays, title cards, and export uses local FFmpeg. Exact MuAPI model parity is not required. Every existing studio and workflow category must remain available through a supported provider model or a local operation.

## Security model

- Keep all Heis provider secrets on the backend.
- Keep customer secrets encrypted in Electron main using `safeStorage`.
- Issue short-lived signed upload URLs and validate object ownership on completion.
- Rate-limit trial issuance, activation, generation submission, and webhook endpoints.
- Redact prompts, tokens, keys, signed URLs, and authorization headers from logs and crash reports.
- Validate model parameters on both the desktop boundary and backend boundary.
- Require explicit approval before an agent spends credits, overwrites media, deletes assets, or exports over an existing file.
- Scan source maps and packaged artifacts for secret patterns before release.

## Release gates

- Apple Developer enrollment completed
- Developer ID signing, hardened runtime, notarization, and update signing verified
- Separate Apple Silicon and Intel DMGs tested on clean Macs
- Stripe test and live products configured
- Billing and credit ledger reconciliation shows no unexplained variance
- Runware failure, timeout, duplicate webhook, and cancellation paths verified
- Privacy policy, terms, proprietary license, refund policy, and provider-policy review complete
- Migration and crash recovery tested against representative existing local projects
- No secret is present in renderer storage, packaged code, source maps, or logs

## Implementation checklist

- [x] Product and architecture reference created
- [x] Shared strict TypeScript contracts added
- [x] Legacy Vite renderer replaced by packaged Next.js renderer
- [x] Typed secure IPC bridge added
- [x] Supabase schema and row-level security added
- [x] Account and entitlement APIs added
- [x] Stripe Checkout, Portal, Tax, and webhooks added
- [x] Credit reservation and settlement added
- [x] Managed Runware adapter added
- [x] Customer-key Runware adapter added
- [x] Secure managed upload URLs and temporary upload cleanup added
- [ ] Curated capability catalog completed (starter image and video catalog exists)
- [x] Codex app-server client added
- [x] Codex desktop conversation UI and native approval responses added
- [x] Local Heis MCP server added
- [ ] Studio and workflow MuAPI calls migrated (seven generation studios use the Heis bridge; remaining studios are gated)
- [x] Managed workflow runner added
- [ ] Signing, notarization, updater, and release gates completed

## Decision log

| Decision | Selected option |
| --- | --- |
| Product surface | Desktop editor plus hosted services |
| Payment processor | Existing US Stripe account |
| Launch products | $99 Lifetime and $29 monthly Creator |
| Trial | 100 credits or 14 days |
| Creator allowance | 2,000 credits monthly, no rollover |
| Top-up | 1,000 credits for $10 |
| Licensing | Three Macs and 30-day offline grace |
| Cancellation | Read and export without another entitlement |
| Project storage | Local-first |
| Managed media retention | 30 days |
| Authentication | Supabase email code and Google OAuth |
| Codex distribution | Customer installs Codex CLI |
| Media provider | Runware behind an adapter |
| Initial platform | macOS, Apple Silicon and Intel |

## Technical references

- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Codex authentication](https://developers.openai.com/codex/auth)
- [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication)
- [Runware platform introduction](https://runware.ai/docs/platform/introduction)
- [Runware task polling](https://runware.ai/docs/platform/task-polling)
- [Runware webhooks](https://runware.ai/docs/platform/webhooks)
- [Stripe SaaS subscriptions](https://docs.stripe.com/get-started/use-cases/saas-subscriptions)
- [Stripe Tax setup](https://docs.stripe.com/tax/set-up)
- [Trigger.dev Next.js setup](https://trigger.dev/docs/guides/frameworks/nextjs)
- [Trigger.dev scheduled tasks](https://trigger.dev/docs/tasks/scheduled)
