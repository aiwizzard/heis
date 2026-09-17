# Heis subscriptions

The desktop download is free. Local projects and the user's own Codex connection need no Heis account or paid entitlement. Codex access is supplied by the user and is not included in Heis pricing. A Heis account is required for cloud storage and billing.

| Plan | Monthly price (USD) | Monthly credits | Cloud storage |
| --- | ---: | ---: | ---: |
| Free | $0 | 0 | 1 GB |
| Creator | $24 | 2,000 | 25 GB |
| Pro | $59 | 6,000 | 100 GB |

Storage is calculated in binary GB (GiB). Local files do not count toward these limits. Free cannot submit Heis generation jobs, including through the desktop MCP tools. No generation provider keys are accepted from users. Core editor/export access remains free; this billing change does not implement unfinished editor tools.

## Credits and billing

Prices are distinct from the reference at https://www.palmier.io/pricing. Our existing cost calculation charges ceil(provider USD cost * 200) credits. The included credits therefore represent at most $10 and $30 of provider cost, leaving room for hosting, storage and payment fees. These are initial prices, not a validated profitability forecast.

Only recognized Stripe monthly USD prices are accepted. Creator must cost 2400 cents and Pro 5900 cents, with quantity one. Checkout creates subscriptions only. Paid invoices grant one monthly allowance per account and billing period, atomically and idempotently. Credits expire at the end of that period and do not roll over. There are no trials, lifetime licenses, credit packs or top-ups. Taxes may apply.

Plan changes take effect at renewal using Stripe subscription schedules, without mid-period credit grants or prorations. The billing portal should allow payment-method updates and cancellation, but disable direct subscription price changes; use the account plan buttons for those. Cancellation at period end retains access through the paid period. Past-due, canceled, incomplete, unknown and expired subscriptions fall back to Free. Cloud files are not immediately deleted on downgrade; new storage is blocked when over quota.

The server enforces active subscription access, monthly wallet expiry and storage limits. Desktop paid entitlements are signed; local Free access does not depend on the signing service. An outdated desktop entitlement never bypasses the server's subscription check.

## Cloud files

Uploads and generated outputs share the quota. The maximum file size is 500 MiB. A generation reserves 500 MiB of space before submitting, then replaces that reservation with actual output size. Upload signing reserves the declared size under a database account lock. The PUT signature binds Content-Length. Account storage controls list, download and delete cloud copies. Deletion waits until an upload's 15-minute signed URL has expired.

Cloud files have the existing 30-day retention policy. Run the Trigger.dev purge task in a configured environment. Local files are unaffected. Failed uploads count against quota until deletion or cleanup. A network interruption during provider submission may leave a queued job pending; users can cancel it to release reservations. Provider callbacks reconcile accepted jobs.

## Local setup and checks

No provider keys are needed for the unit tests, renderer builds, packaged Free desktop smoke test or isolated PostgreSQL integration checks. Live Google sign-in, checkout, webhook delivery, cloud transfers and generation require configured services and have not been exercised by these local checks.

For integration testing, copy apps/web/.env.example to apps/web/.env.local and supply local Supabase values, Stripe test-mode credentials and monthly price IDs, a test R2 bucket, Runware credentials, and an entitlement signing key. Do not commit secrets. Set NEXT_PUBLIC_HEIS_API_URL to the local account server URL. The desktop process uses HEIS_API_URL, HEIS_SUPABASE_URL, HEIS_SUPABASE_ANON_KEY and HEIS_ENTITLEMENT_PUBLIC_KEY. Restart after changing environment values.

Apply both Supabase migrations in timestamp order. The new migration disables legacy test entitlements and zeroes retired trial/purchased wallets. It preserves project and media data. Fresh signup creates only a profile, with no credit grant.

Forward Stripe checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted and invoice.paid events to /v1/webhooks/stripe. Use the Stripe CLI webhook signing secret for local forwarding. Runware needs a reachable /v1/webhooks/runware URL with the configured webhook token. R2 CORS must allow your account origin, PUT and GET, and Content-Type/Content-Length headers. Enable the retention task before enabling cloud uploads in production.

Run npm test, npm run build:core, npm run build:electron, npm run build:desktop-renderer, npm run web:build and npm run landing:build with Node 22.12 or newer. HEIS_TEST_FREE=1 npm run test:desktop verifies the desktop without a paid entitlement. tests/subscriptionDatabase.sql exercises signup, quota enforcement, subscription gating, invoice replay and downgrade against a disposable PostgreSQL database after the migrations. It requires the Supabase auth schema/functions or equivalent local test stubs.

Production providers are not configured. This implementation is local; the previously deployed landing page has not been replaced in this change.
