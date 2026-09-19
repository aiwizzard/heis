export function accessMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/HEIS_AUTH_NOT_CONFIGURED/.test(text))
    return "Sign-in is not available in this build. Please install a configured Heis release.";
  if (/VALID_ENTITLEMENT_REQUIRED|HEIS_AUTH_REQUIRED|AUTH_REQUIRED/.test(text))
    return "Sign in to Heis to use generation. If you’re already signed in, refresh your account access.";
  if (/MANAGED_ACCESS_REQUIRED/.test(text))
    return "Generation requires a Creator or Pro plan. Open your account to view your options.";
  if (/INSUFFICIENT.*CREDIT|CREDIT.*INSUFFICIENT/.test(text))
    return "You don’t have enough credits for this generation. Check your balance in your account.";
  if (/fetch|network|offline/i.test(text))
    return "We couldn’t connect to Heis. Check your connection and try again.";
  if (/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(text))
    return "We couldn’t complete this request. Please try again or refresh your account access.";
  return text.replace(/^Error:\s*/, "");
}
export function needsAccount(error: string) {
  return /ENTITLEMENT|AUTH_REQUIRED|MANAGED_ACCESS|CREDIT/.test(error);
}
