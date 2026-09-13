const STORAGE_KEY = "heis_app_interests_v1";
const MAX_INTERESTS = 100;
const MAX_NAME_LENGTH = 120;

function readInterests(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((name): name is string => typeof name === "string" && name.length <= MAX_NAME_LENGTH))].slice(0, MAX_INTERESTS);
  } catch {
    return [];
  }
}

export async function getAppInterests(): Promise<string[]> {
  return readInterests();
}

export async function registerAppInterest(appName: string): Promise<string[]> {
  const normalized = appName.trim();
  if (!normalized || normalized.length > MAX_NAME_LENGTH) throw new Error("Invalid app name.");
  const next = [...new Set([...readInterests(), normalized])].slice(-MAX_INTERESTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
