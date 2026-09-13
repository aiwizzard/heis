import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserClient(accessToken: string) {
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  return { client, user: data.user, token };
}
