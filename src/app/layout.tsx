import type { Metadata } from 'next';
import './globals.css';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { SessionProvider } from '@/components/auth/SessionProvider';

export const metadata: Metadata = {
  title: 'LogLense',
  description: 'Feral Druid WarcraftLogs analyser',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AuthHeader />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
