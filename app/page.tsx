import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'Heis | AI Creative Studio for macOS',
  description: 'Create AI images, videos, audio, cinema, lip sync, workflows, and agent-assisted projects from your Mac.',
};

export default function Home() {
  return <LandingPage />;
}
