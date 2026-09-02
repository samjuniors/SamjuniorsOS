import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'SamJuniors OS — Autonomous AI Executive Desktop',
  description: 'An internal desktop operating system for an AI-run company featuring an autonomous multi-agent workforce, company vitals, and executive orchestrator.',
  openGraph: {
    title: 'SamJuniors OS — Autonomous AI Executive Desktop',
    description: 'An internal desktop operating system for an AI-run company featuring an autonomous multi-agent workforce, company vitals, and executive orchestrator.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SamJuniors OS — Autonomous AI Executive Desktop',
    description: 'An internal desktop operating system for an AI-run company featuring an autonomous multi-agent workforce, company vitals, and executive orchestrator.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full overflow-hidden select-none bg-black text-slate-100 font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
