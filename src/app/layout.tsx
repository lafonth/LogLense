import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogLense',
  description: 'Feral Druid WarcraftLogs analyser',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
