import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heis | AI creative studio for macOS",
  description: "Create images, video, audio, workflows, and agent-assisted edits in one local-first macOS studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
