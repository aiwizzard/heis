import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";
export async function getServerClient() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), { cookies: {
    getAll: () => store.getAll(),
    setAll(values) { try { for (const value of values) store.set(value.name, value.value, value.options); } catch {} },
  } });
}
