import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'heis — Open-Source AI Creative Studio',
  description: 'Create AI images, videos, audio, cinema, lip sync, workflows, and agents with 400+ models across 14 studios.',
};

export default function Home() {
  return <LandingPage />;
}
