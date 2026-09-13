'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19 19 5M9 5h10v10" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </svg>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {

    const updateScroll = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 40);
      document.documentElement.style.setProperty('--landing-scroll', `${Math.min(scrollY, 650) * 0.22}px`);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px' },
    );

    document.querySelectorAll('.landing-reveal').forEach((element) => observer.observe(element));
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateScroll);
    };
  }, []);

  return (
    <main className="landing-shell">
      <div className="landing-noise" aria-hidden="true" />

      <nav className={`landing-nav${scrolled ? ' is-scrolled' : ''}`} aria-label="Main navigation">
        <div className="landing-container landing-nav-inner">
          <Link href="/" className="landing-logo" aria-label="heis home">
            heis<span>.</span>
          </Link>
          <div className="landing-nav-links">
            <a href="#expertise">Why heis</a>
            <a href="#works">Studios</a>
            <a href="#perspectives">Local-first</a>
          </div>
          <Link href="/studio" className="landing-pill landing-pill-light">
            Launch studio <ArrowIcon />
          </Link>
        </div>
      </nav>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-atmosphere" aria-hidden="true" />
        <div className="landing-hand landing-hand-left" aria-hidden="true" />
        <div className="landing-hand landing-hand-right" aria-hidden="true" />
        <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
        <div className="landing-orbit landing-orbit-two" aria-hidden="true" />

        <div className="landing-container landing-hero-content">

          <h1 id="landing-title" className="landing-reveal is-visible">
            heis.<br />
            <em>Create on your terms.</em>
          </h1>
          <p className="landing-hero-copy landing-reveal is-visible">
            Generate images, videos, audio, cinematic sequences, and more with selected cloud and local AI models in one creative workspace.
          </p>
          <div className="landing-hero-actions landing-reveal is-visible">
            <Link href="/studio" className="landing-pill landing-pill-orange">
              Start creating <ArrowIcon />
            </Link>
            <a href="#works" className="landing-text-link">Explore the studios</a>
          </div>

        </div>

      </section>

      <section id="expertise" className="landing-mission">
        <div className="landing-container">
          <p className="landing-section-label landing-reveal"><span>01</span> Why heis</p>
          <div className="landing-mission-grid">
            <h2 className="landing-reveal">One focused studio. Every way to bring an idea to life.</h2>
            <div className="landing-mission-copy landing-reveal">
              <p>Move from a prompt to a finished image, video, soundtrack, or lip-synced performance without jumping between disconnected tools.</p>
              <p>Run locally, connect cloud models, build reusable workflows, and keep control of the creative stack.</p>
            </div>
          </div>
          <div className="landing-brand-row landing-reveal" aria-label="Featured AI model families">
            <span>FLUX</span><span>KLING</span><span>VEO</span><span>SORA</span>
          </div>
        </div>
      </section>

      <section id="works" className="landing-works">
        <div className="landing-grid-pattern" aria-hidden="true" />
        <div className="landing-container">
          <p className="landing-section-label landing-reveal"><span>02</span> Creative studios</p>
          <header className="landing-works-heading landing-reveal">
            <h2>Make the image.<br /><em>Direct the motion.</em></h2>
            <p>Go from a single prompt to a complete production with focused tools for every stage of the process.</p>
          </header>
          <div className="landing-cards">
            <Link href="/studio" className="landing-card landing-card-orange landing-reveal">
              <div className="landing-card-top">
                <span className="landing-icon"><SparkIcon /></span><span className="landing-card-number">01</span>
              </div>
              <div>
                <p className="landing-card-tag">Image and design</p>
                <h3>Images &<br />Design</h3>
                <p className="landing-card-copy">Create and edit with Flux, Midjourney, Nano Banana, Seedream, and more—then hand the work to an autonomous design agent.</p>
              </div>
              <div className="landing-card-footer"><span>Open image studio</span><ArrowIcon /></div>
            </Link>
            <Link href="/studio" className="landing-card landing-card-dark landing-reveal">
              <div className="landing-card-top">
                <span className="landing-icon"><ArrowIcon /></span><span className="landing-card-number">02</span>
              </div>
              <div>
                <p className="landing-card-tag">Video, cinema, and audio</p>
                <h3>Motion &<br />Sound</h3>
                <p className="landing-card-copy">Generate with Kling, Veo, Sora, Seedance, and Wan. Build scenes in Cinema Studio, add audio, and create precise lip sync.</p>
              </div>
              <div className="landing-card-footer"><span>Open video studio</span><ArrowIcon /></div>
            </Link>
          </div>
        </div>
      </section>

      <section id="perspectives" className="landing-perspective">
        <div className="landing-container landing-perspective-inner">
          <p className="landing-section-label landing-reveal"><span>03</span> Local-first by design</p>
          <blockquote className="landing-reveal">“Your ideas, your models, your machine. A creative platform should help you make more while keeping your projects close.”</blockquote>
          <Link href="/studio" className="landing-circle-cta landing-reveal" aria-label="Launch heis studio">
            <span>Launch<br />heis</span><ArrowIcon />
          </Link>
        </div>
      </section>

      <footer id="contact" className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-top">
            <h2>Make anything.<br /><em>Own the process.</em></h2>
            <div className="landing-footer-links">
              <a href="https://github.com/Anil-matcha/heis" target="_blank" rel="noreferrer">View on GitHub</a>
              <Link href="/studio">Launch studio</Link>
            </div>
          </div>
          <div className="landing-wordmark">HEIS.</div>
          <div className="landing-footer-bottom">
            <span>© {new Date().getFullYear()} Heis. All rights reserved.</span>
            <div><a href="https://github.com/Anil-matcha/heis" target="_blank" rel="noreferrer">GitHub</a><a href="https://discord.gg/tANKJkHck" target="_blank" rel="noreferrer">Discord</a><a href="https://x.com/matchaman11" target="_blank" rel="noreferrer">X / Twitter</a></div>
            <a href="#landing-title">Back to top ↑</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
