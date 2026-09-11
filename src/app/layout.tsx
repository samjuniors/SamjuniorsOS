import type {Metadata} from 'next';
import './v2-globals.css';

export const metadata: Metadata = {
  title: 'SamJuniorsOS',
  description: 'The internal operating system for SamJuniors.',
  openGraph: {
    title: 'SamJuniorsOS',
    description: 'The internal operating system for SamJuniors.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SamJuniorsOS',
    description: 'The internal operating system for SamJuniors.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body className="h-full overflow-hidden select-none bg-black text-slate-100 font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
