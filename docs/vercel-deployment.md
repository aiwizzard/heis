# Heis web deployments

The marketing site and account app share this repository and deploy as separate Vercel projects.

| Project | Root directory | Domain | Build command |
| --- | --- | --- | --- |
| heis-landing | apps/landing | heis.studio | npm run build |
| heis-web | apps/web | app.heis.studio | npm run build -w @heis/core && npm run build -w @heis/web |

Both use Next.js, Node 22.x, npm ci, and source files outside the root directory. Run CLI deployments from the repository root so shared components and workspace dependencies are included.

```sh
vercel link --yes --project heis-landing
vercel deploy --prod --yes

vercel link --yes --project heis-web
vercel deploy --prod --yes
```

The landing app preserves the original deep crimson design from components/LandingPage.tsx and the landing section of app/globals.css in its own component and stylesheet. Its artwork lives in apps/landing/public/assets, and its Inter and Playfair Display fonts are bundled by Next.js. The landing page requires no backend credentials. The Mac download is marked coming soon until a public installer is available.

For the account app, set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel before building. Set NEXT_PUBLIC_HEIS_API_URL and NEXT_PUBLIC_SITE_URL to https://app.heis.studio. Configure https://app.heis.studio/auth/callback as an allowed Supabase redirect URL. Configure Google OAuth in Supabase if enabling Google sign-in.

Billing, device activation, storage, and managed generation require their respective variables from apps/web/.env.example, the Supabase schema, Stripe products and webhooks, and a separate Trigger.dev worker deployment. Publishing the Next.js app alone does not configure these services.

Until the Supabase URL and anon key are set, account visitors see an account access coming soon message. After changing public environment variables, redeploy the web project. Do not commit environment files or .vercel project state.

CLI deployment publishes the local checkout. Automatic GitHub deployments require connecting each Vercel project to aiwizzard/heis and committing and pushing these changes.
