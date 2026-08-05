import type { Metadata } from 'next';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { SessionProvider } from '@/components/auth/SessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogLense',
  description: 'Feral Druid WarcraftLogs analyser',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* `min-h-screen` alone lets <body> grow past the viewport when content
          is tall, so the h-full/min-h-0 chain below it never has a bounded
          height to cap against — it only ever grows with the page. From `md`
          up, surfaces like the results dashboard need real internal scroll
          regions instead, so body additionally gets a definite height there
          and stops propagating overflow to the viewport; anything that still
          needs whole-page scroll at that width (nothing does today) falls
          back to the wrapper's own scroll. Below `md` neither applies, so the
          page scrolls as one column exactly as before. */}
      <body className="flex min-h-screen flex-col md:h-screen md:overflow-hidden">
        <SessionProvider>
          <AuthHeader />
          <div className="min-h-0 flex-1 md:overflow-y-auto">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
