import HeisBrand from '../../../components/HeisBrand';
import Link from "next/link";

export default function HomePage() {
  return <main className="shell">
    <nav className="nav"><span className="brand"><HeisBrand theme="dark" /></span><Link className="button secondary" href="/account">Account</Link></nav>
    <section className="hero">
      <h1>Your AI creative studio, on your Mac.</h1>
      <p>Generate and edit images, video, audio, workflows, and agent-driven projects. Keep projects local and choose managed credits or your own provider keys.</p>
      <Link className="button" href="/login">Start with 100 credits</Link>
    </section>
    <section className="plans">
      <article className="card"><h2>Trial</h2><div className="price">Free</div><p className="muted">100 managed credits for 14 days.</p></article>
      <article className="card"><h2>Lifetime</h2><div className="price">$99</div><p className="muted">Own Heis 1.x and generate with your keys on three Macs.</p></article>
      <article className="card"><h2>Creator</h2><div className="price">$29/mo</div><p className="muted">2,000 managed credits every month, plus optional BYOK.</p></article>
    </section>
  </main>;
}
