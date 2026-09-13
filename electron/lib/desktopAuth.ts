const { shell } = require("electron");
const { createClient } = require("@supabase/supabase-js");

class MemoryAuthStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class DesktopAuth {
  private readonly client: any;
  private readonly authSession: any;
  private readonly secureStore: any;
  private readonly onEvent: (event: any) => void;

  constructor(authSession: any, secureStore: any, onEvent: (event: any) => void) {
    const url = process.env.HEIS_SUPABASE_URL;
    const anonKey = process.env.HEIS_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      this.client = null;
    } else {
      this.client = createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: false, autoRefreshToken: true, storage: new MemoryAuthStorage() } });
    }
    this.authSession = authSession;
    this.secureStore = secureStore;
    this.onEvent = onEvent;
  }

  private requiredClient() {
    if (!this.client) throw new Error("HEIS_AUTH_NOT_CONFIGURED");
    return this.client;
  }

  async restore(): Promise<void> {
    const refreshToken = this.secureStore.get("supabaseRefreshToken");
    if (!refreshToken || !this.client) return;
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) { this.authSession.clear(); return; }
    this.acceptSession(data.session);
  }

  async startOAuth(provider: "google"): Promise<void> {
    const { data, error } = await this.requiredClient().auth.signInWithOAuth({ provider, options: { redirectTo: "heis://auth/callback", skipBrowserRedirect: true } });
    if (error || !data.url) throw error ?? new Error("Could not start Heis sign-in.");
    await shell.openExternal(data.url);
  }

  async sendMagicLink(email: string): Promise<void> {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email address is required.");
    const { error } = await this.requiredClient().auth.signInWithOtp({ email, options: { emailRedirectTo: "heis://auth/callback" } });
    if (error) throw error;
  }

  async handleCallback(callbackUrl: string): Promise<void> {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    if (!code) throw new Error(url.searchParams.get("error_description") ?? "Sign-in callback did not contain a code.");
    const { data, error } = await this.requiredClient().auth.exchangeCodeForSession(code);
    if (error || !data.session) throw error ?? new Error("Could not complete Heis sign-in.");
    this.acceptSession(data.session);
    this.onEvent({ type: "signed-in", user: { id: data.user?.id, email: data.user?.email } });
  }

  async signOut(): Promise<void> {
    if (this.client) await this.client.auth.signOut({ scope: "local" });
    this.authSession.clear();
    this.onEvent({ type: "signed-out" });
  }

  private acceptSession(session: any): void {
    this.authSession.set({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at, userId: session.user.id });
  }
}

module.exports = { DesktopAuth, MemoryAuthStorage };
