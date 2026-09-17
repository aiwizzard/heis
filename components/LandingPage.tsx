'use client';

import { useEffect, useRef, useState } from 'react';
import HeisBrand from './HeisBrand';

const screens = [
  { id: 'video', name: 'Video', title: 'Start with a scene in mind.', alt: 'Heis Video Studio with model, aspect ratio, duration and resolution controls' },
  { id: 'image', name: 'Image', title: 'Find the look before the motion.', alt: 'Heis Image Studio showing its prompt composer and image generation controls' },
  { id: 'audio', name: 'Audio', title: 'Give the idea a voice.', alt: 'Heis Audio Studio with the audio generation interface' },
];
const faqs = [
  ['Is Heis a desktop app?', 'Yes. Heis is built around a desktop workspace. This site introduces the app; your web account is used for sign-in, devices, and billing. See the download section below for the current release status.'],
  ['Does everything run locally?', 'No. The interface and local project files live on your computer. Cloud generation sends the required prompts and media to the selected provider and needs an internet connection. Supported local models require a separate setup and suitable hardware.'],
  ['How does generation pricing work?', 'Managed generation uses credits. Where supported by your plan, you can connect your own provider key and pay that provider directly. Model, duration, and resolution affect generation cost. Check your account for available plans and credits.'],
  ['Can I edit and export a complete film?', 'Heis currently brings together focused generation and media tools. A full timeline editing workflow is not yet available in the public release. Save generated assets and use your preferred editor to assemble the final film.'],
  ['Which computer do I need?', 'The current desktop build targets Apple silicon Macs. Exact macOS requirements and installer details will accompany the public release. Local AI models have additional memory and storage requirements; cloud generation does not require running those models on your Mac.'],
];
function Arrow({ down = false }: { down?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={down ? 'M12 4v16m-6-6 6 6 6-6' : 'M5 12h14m-6-6 6 6-6 6'} /></svg>;
}

export default function LandingPage() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = root.current;
    if (!surface || !('IntersectionObserver' in window)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;
        observer.unobserve(target);
        if (preference.matches) return;
        const animation = target.animate(
          [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' },
        );
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: 0.12 });
    surface.querySelectorAll('.landing-section-heading, .landing-steps article, .landing-studies-heading, .landing-study-grid figure, .landing-control > div, .landing-faq > div, .landing-download, .landing-signature').forEach(element => observer.observe(element));
    const cancelMotion = () => {
      if (preference.matches) animations.forEach(animation => animation.cancel());
    };
    preference.addEventListener('change', cancelMotion);
    return () => {
      observer.disconnect();
      animations.forEach(animation => animation.cancel());
      preference.removeEventListener('change', cancelMotion);
    };
  }, []);
  const screen = screens[active];
  const download = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL;
  const installer = download && /^https:\/\//.test(download) ? download : null;
  const account = process.env.NEXT_PUBLIC_ACCOUNT_URL || 'https://app.heis.studio/account';
  return (
    <div className="landing-shell" ref={root}>
      <a className="landing-skip" href="#main">Skip to content</a>
      <header className="landing-nav">
        <div className="landing-container landing-nav-inner">
          <a href="#main" aria-label="Heis home"><HeisBrand theme="dark" height={32} /></a>
          <nav className="landing-links" aria-label="Main navigation"><a href="#workspace">Workspace</a><a href="#workflow">Workflow</a><a href="#questions">Questions</a></nav>
          <a className="landing-button landing-button-small" href="#download">Get Heis <Arrow down /></a>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero landing-container" aria-labelledby="landing-title">

          <div className="landing-hero-grid">
            <h1 id="landing-title">Your desktop studio<br />for <em>AI video.</em></h1>
            <div className="landing-intro"><p>Video, images, and sound. One focused workspace for your next idea.</p><div className="landing-actions"><a href="#download" className="landing-button landing-button-primary">Get Heis for Mac <Arrow down /></a><a href="#workspace" className="landing-text-link">Explore the app <Arrow /></a></div><span className="landing-fine">{installer ? 'Apple silicon · macOS' : 'Apple silicon · Public release in preparation'}</span></div>
          </div>
          <div className="landing-preview" id="workspace">
            <div className="landing-preview-toolbar"><div className="landing-preview-tabs" role="group" aria-label="Choose a studio preview">{screens.map((item, i) => <button key={item.id} type="button" aria-pressed={active === i} onClick={() => setActive(i)}>{item.name}</button>)}</div></div>
            <div className="landing-preview-stage">{screens.map((item, i) => <img key={item.id} className={`landing-app-shot${active === i ? ' is-active' : ''}`} src={`/assets/landing/studio-${item.id}.webp`} alt={active === i ? item.alt : ''} aria-hidden={active !== i} width={1280} height={820} fetchPriority={i === 0 ? 'high' : 'low'} />)}</div>
            <div className="landing-preview-caption" aria-live="polite"><p key={screen.id}>{screen.title}</p></div>
          </div>
        </section>
        <section id="workflow" className="landing-section landing-container">
          <div className="landing-section-heading"><h2>Follow the idea.<br /><em>Keep your focus.</em></h2></div>
          <div className="landing-steps">
            <article><span className="landing-step-number">01</span><h3>Set the visual direction</h3><p>Explore images and camera references to find your look.</p><a href="#workspace" onClick={() => setActive(1)}>See Image Studio <Arrow /></a></article>
            <article><span className="landing-step-number">02</span><h3>Make it move</h3><p>Choose a model, frame your shot, and create the motion.</p><a href="#workspace" onClick={() => setActive(0)}>See Video Studio <Arrow /></a></article>
            <article><span className="landing-step-number">03</span><h3>Build the sound</h3><p>Create audio and lip sync. Save your assets for the final edit.</p><a href="#workspace" onClick={() => setActive(2)}>See Audio Studio <Arrow /></a></article>
          </div>
        </section>
        <section className="landing-studies" aria-labelledby="studies-title"><div className="landing-container">
          <div className="landing-studies-heading"><div><h2 id="studies-title">A feel for <em>the frame.</em></h2></div><p>Find your look with Cinema Studio’s camera and lens references.</p></div>
          <div className="landing-study-grid">{[{file:'classic_16mm_film',name:'Texture & character',detail:'Classic 16mm film'},{file:'classic_anamorphic',name:'A wider perspective',detail:'Classic anamorphic'},{file:'extreme_macro',name:'Closer to the detail',detail:'Extreme macro'}].map((item)=><figure key={item.file}><img src={`/assets/landing/${item.file}.webp`} width={640} height={640} loading="lazy" alt={`${item.detail} visual reference from Cinema Studio`} /><figcaption><h3>{item.detail}</h3></figcaption></figure>)}</div>

        </div></section>
        <section className="landing-section landing-container landing-control" id="control"><div><h2>Keep the work close.<br /><em>Choose how you create.</em></h2></div><div className="landing-control-list"><article><span>01</span><div><h3>A home on your computer</h3><p>Keep local project files on your Mac and return to a familiar workspace with light and dark themes.</p></div></article><article><span>02</span><div><h3>Cloud when you need it</h3><p>Use supported cloud models through managed credits or your own provider key, where your plan allows. Requests are processed by the selected provider.</p></div></article><article><span>03</span><div><h3>Local where supported</h3><p>Connect supported local runtimes separately. Model availability and performance depend on your setup and hardware.</p></div></article></div></section>
        <section id="questions" className="landing-section landing-container landing-faq"><div><h2>A few good<br /><em>questions.</em></h2></div><div>{faqs.map(([question,answer])=><details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
        <section id="download" className="landing-download landing-container" aria-labelledby="download-title"><img src="/brand/heis-icon-192.png" width={72} height={72} alt="Heis app icon" loading="lazy" /><h2 id="download-title">Make room for<br /><em>your next idea.</em></h2><p>{installer ? 'The Heis desktop app for Apple silicon Macs.' : 'Coming to Apple silicon Macs.'}</p><div className="landing-actions">{installer ? <a className="landing-button landing-button-primary" href={installer}>Download for Mac <Arrow down /></a> : <span className="landing-release-status"><span className="landing-status" /> Mac download coming soon</span>}<a href={account} className="landing-text-link">Your account <Arrow /></a></div></section>
      </main>
      <div className="landing-signature landing-container" aria-hidden="true">
        <img src="/brand/heis-wordmark-dark.svg" alt="" width={900} height={400} loading="lazy" />
      </div>
      <footer className="landing-footer landing-container"><a href="#main" aria-label="Heis home"><HeisBrand theme="dark" height={30} /></a><span>© {new Date().getFullYear()} Heis</span><nav aria-label="Footer navigation"><a href="#workspace">Workspace</a><a href="#questions">Questions</a><a href={account}>Account</a><a href="#main">Back to top ↑</a></nav></footer>
    </div>
  );
}
