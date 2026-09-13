class AuthSession {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private userId: string | null = null;
  private readonly secureStore: any;

  constructor(secureStore: any) {
    this.secureStore = secureStore;
  }

  set(session: { accessToken: string; refreshToken: string; expiresAt: number; userId: string }): void {
    if (!session?.accessToken || !session?.refreshToken || !session?.userId || !Number.isFinite(session.expiresAt)) {
      throw new Error("Invalid authentication session.");
    }
    this.accessToken = session.accessToken;
    this.expiresAt = session.expiresAt;
    this.userId = session.userId;
    this.secureStore.set("supabaseRefreshToken", session.refreshToken);
  }

  get(): { accessToken: string; userId: string | null; expiresAt: number; hasRefreshToken: boolean } | null {
    if (!this.accessToken) return null;
    return {
      accessToken: this.accessToken,
      userId: this.userId,
      expiresAt: this.expiresAt,
      hasRefreshToken: this.secureStore.has("supabaseRefreshToken"),
    };
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUserId(): string | null { return this.userId; }

  clear(): void {
    this.accessToken = null;
    this.expiresAt = 0;
    this.userId = null;
    this.secureStore.delete("supabaseRefreshToken");
  }
}

module.exports = { AuthSession };
