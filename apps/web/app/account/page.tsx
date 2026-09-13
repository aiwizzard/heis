import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase-server";
import AccountClient from "./AccountClient";
export default async function AccountPage() {
  const supabase = await getServerClient(); const { data } = await supabase.auth.getUser(); if (!data.user) redirect("/login");
  return <main className="shell account"><nav className="nav"><Link className="brand" href="/">Heis</Link></nav><h1>Your account</h1><AccountClient /></main>;
}
