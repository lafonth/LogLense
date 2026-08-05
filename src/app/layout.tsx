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
      <body className="flex min-h-screen flex-col">
        <SessionProvider>
          <AuthHeader />
          <div className="min-h-0 flex-1">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
