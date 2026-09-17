'use client';

import { useState } from 'react';
import HeisBrand from './HeisBrand';

const screens = [
  { id: 'video', name: 'Video', title: 'Start with a scene in mind.', description: 'Choose a video model, describe your shot, and set its duration and format. Keep the controls close and the canvas clear.', alt: 'Heis Video Studio with model, aspect ratio, duration and resolution controls' },
  { id: 'image', name: 'Image', title: 'Find the look before the motion.', description: 'Explore visual directions in Image Studio. Keep image creation alongside your video tools, in the same desktop workspace.', alt: 'Heis Image Studio showing its prompt composer and image generation controls' },
  { id: 'audio', name: 'Audio', title: 'Give the idea a voice.', description: 'Switch to Audio Studio for sound generation, or open Lip Sync to work with a speaking performance.', alt: 'Heis Audio Studio with the audio generation interface' },
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
  const screen = screens[active];
  const download = process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL;
  const installer = download && /^https:\/\//.test(download) ? download : null;
  const account = process.env.NEXT_PUBLIC_ACCOUNT_URL || 'https://app.heis.studio/account';
  return (
    <div className="landing-shell">
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
          <p className="landing-eyebrow"><span className="landing-status" /> A creative workspace for your Mac</p>
          <div className="landing-hero-grid">
            <h1 id="landing-title">Your desktop studio<br />for <em>AI video.</em></h1>
            <div className="landing-intro"><p>Find the look. Create the motion. Give it a voice. Bring your video, image, and audio tools into one focused workspace.</p><div className="landing-actions"><a href="#download" className="landing-button landing-button-primary">Get Heis for Mac <Arrow down /></a><a href="#workspace" className="landing-text-link">Explore the app <Arrow /></a></div><span className="landing-fine">{installer ? 'Apple silicon · macOS' : 'Apple silicon · Public release in preparation'}</span></div>
          </div>
          <div className="landing-preview" id="workspace">
            <div className="landing-preview-toolbar"><div className="landing-preview-tabs" role="group" aria-label="Choose a studio preview">{screens.map((item, i) => <button key={item.id} type="button" aria-pressed={active === i} onClick={() => setActive(i)}>{item.name}</button>)}</div><span>Inside Heis <span aria-hidden="true">↗</span></span></div>
            <img className="landing-app-shot" src={`/assets/landing/studio-${screen.id}.webp`} alt={screen.alt} width={1280} height={820} fetchPriority="high" />
            <div className="landing-preview-caption" aria-live="polite"><span>0{active + 1} / THE WORKSPACE</span><p><strong>{screen.title}</strong> {screen.description}</p></div>
          </div>
          <div className="landing-feature-strip"><span>Video generation</span><span>Image creation</span><span>Audio & lip sync</span><span>Cloud & local options</span></div>
        </section>
        <section id="workflow" className="landing-section landing-container">
          <div className="landing-section-heading"><p className="landing-eyebrow">01 / A connected process</p><h2>Follow the idea.<br /><em>Keep your focus.</em></h2><p>Move between creative tasks without rebuilding your workspace each time.</p></div>
          <div className="landing-steps">
            <article><span className="landing-step-number">01</span><h3>Set the visual direction</h3><p>Explore an image or describe a cinematic scene. Use camera and lens references to shape the look you are after.</p><a href="#workspace" onClick={() => setActive(1)}>See Image Studio <Arrow /></a></article>
            <article><span className="landing-step-number">02</span><h3>Make it move</h3><p>Choose a video model and set the shot’s format and duration. Explore motion tools as the idea takes shape.</p><a href="#workspace" onClick={() => setActive(0)}>See Video Studio <Arrow /></a></article>
            <article><span className="landing-step-number">03</span><h3>Build the sound</h3><p>Create audio or work with lip sync. Save the assets you want to keep, ready for assembly in your preferred editor.</p><a href="#workspace" onClick={() => setActive(2)}>See Audio Studio <Arrow /></a></article>
          </div>
        </section>
        <section className="landing-studies" aria-labelledby="studies-title"><div className="landing-container">
          <div className="landing-studies-heading"><div><p className="landing-eyebrow">02 / Think like a filmmaker</p><h2 id="studies-title">A feel for <em>the frame.</em></h2></div><p>Explore camera and lens references in Cinema Studio. Start with a visual intention, then shape your prompt.</p></div>
          <div className="landing-study-grid">{[{file:'classic_16mm_film',name:'Texture & character',detail:'Classic 16mm film'},{file:'classic_anamorphic',name:'A wider perspective',detail:'Classic anamorphic'},{file:'extreme_macro',name:'Closer to the detail',detail:'Extreme macro'}].map((item,i)=><figure key={item.file}><img src={`/assets/landing/${item.file}.webp`} width={640} height={640} loading="lazy" alt={`${item.detail} visual reference from Cinema Studio`} /><figcaption><span>0{i+1}</span><div><h3>{item.name}</h3><p>{item.detail}</p></div></figcaption></figure>)}</div>
          <p className="landing-fine">Built-in Cinema Studio references. These illustrate visual styles, not outputs generated for this page.</p>
        </div></section>
        <section className="landing-section landing-container landing-control" id="control"><div><p className="landing-eyebrow">03 / Your workspace, your choices</p><h2>Keep the work close.<br /><em>Choose how you create.</em></h2><p className="landing-section-copy">A desktop home for your creative process, with a clear distinction between what stays on your machine and what runs in the cloud.</p></div><div className="landing-control-list"><article><span>01</span><div><h3>A home on your computer</h3><p>Keep local project files on your Mac and return to a familiar workspace with light and dark themes.</p></div></article><article><span>02</span><div><h3>Cloud when you need it</h3><p>Use supported cloud models through managed credits or your own provider key, where your plan allows. Requests are processed by the selected provider.</p></div></article><article><span>03</span><div><h3>Local where supported</h3><p>Connect supported local runtimes separately. Model availability and performance depend on your setup and hardware.</p></div></article></div></section>
        <section id="questions" className="landing-section landing-container landing-faq"><div><p className="landing-eyebrow">Before you begin</p><h2>A few good<br /><em>questions.</em></h2></div><div>{faqs.map(([question,answer])=><details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
        <section id="download" className="landing-download landing-container" aria-labelledby="download-title"><img src="/brand/heis-icon-192.png" width={72} height={72} alt="Heis app icon" loading="lazy" /><p className="landing-eyebrow">Made for your creative process</p><h2 id="download-title">Make room for<br /><em>your next idea.</em></h2><p>{installer ? 'The Heis desktop app for Apple silicon Macs.' : 'Heis for Apple silicon Macs is on its way. Explore the workspace above while we prepare the public installer.'}</p><div className="landing-actions">{installer ? <a className="landing-button landing-button-primary" href={installer}>Download for Mac <Arrow down /></a> : <span className="landing-release-status"><span className="landing-status" /> Mac download coming soon</span>}<a href={account} className="landing-text-link">Your account <Arrow /></a></div><p className="landing-fine">Cloud generation requires internet access and provider usage is billed separately or through credits.</p></section>
      </main>
      <footer className="landing-footer landing-container"><a href="#main" aria-label="Heis home"><HeisBrand theme="dark" height={30} /></a><span>© {new Date().getFullYear()} Heis</span><nav aria-label="Footer navigation"><a href="#workspace">Workspace</a><a href="#questions">Questions</a><a href={account}>Account</a><a href="#main">Back to top ↑</a></nav></footer>
    </div>
  );
}
