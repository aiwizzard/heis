import HeisBrand from '../../../../components/HeisBrand';
import Link from "next/link";
import LoginForm from "./LoginForm";
export default function LoginPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return <main className="shell account"><nav className="nav"><Link className="brand" href="/"><HeisBrand theme="dark" /></Link></nav><h1>Sign in to Heis</h1><p className="muted">Your Heis account manages devices, subscriptions, and generation credits. Codex authentication remains separate.</p>{configured ? <LoginForm /> : <div className="card"><h2>Account access coming soon</h2><p className="muted">We are getting sign-in ready. Please check back shortly.</p><a className="button secondary" href="https://heis.studio">Back to Heis</a></div>}</main>;
}
