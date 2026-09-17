import HeisBrand from '../../../../components/HeisBrand';
import Link from "next/link";
import LoginForm from "./LoginForm";
export default function LoginPage() {
  return <main className="shell account"><nav className="nav"><Link className="brand" href="/"><HeisBrand theme="dark" /></Link></nav><h1>Sign in to Heis</h1><p className="muted">Your Heis account manages devices, subscriptions, and generation credits. Codex authentication remains separate.</p><LoginForm /></main>;
}
