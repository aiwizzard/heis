function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  stripeLifetimePriceId: () => required("STRIPE_LIFETIME_PRICE_ID"),
  stripeCreatorPriceId: () => required("STRIPE_CREATOR_PRICE_ID"),
  stripeTopupPriceId: () => required("STRIPE_TOPUP_PRICE_ID"),
  runwareApiKey: () => required("RUNWARE_API_KEY"),
  runwareWebhookToken: () => required("RUNWARE_WEBHOOK_TOKEN"),
  publicApiUrl: () => required("NEXT_PUBLIC_HEIS_API_URL").replace(/\/$/, ""),
  entitlementPrivateKey: () => required("HEIS_ENTITLEMENT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  r2AccountId: () => required("R2_ACCOUNT_ID"),
  r2AccessKeyId: () => required("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: () => required("R2_SECRET_ACCESS_KEY"),
  r2Bucket: () => required("R2_BUCKET"),
};
