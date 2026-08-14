import type { Metadata } from 'next';
import { Fira_Code, IM_Fell_English } from 'next/font/google';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { SessionProvider } from '@/components/auth/SessionProvider';
import './globals.css';

/*
 * Les deux familles étaient tirées par un `@import url(fonts.googleapis.com)` en tête de
 * `globals.css` : une requête réseau bloquante vers un tiers avant le premier pixel, plus
 * une résolution DNS que rien ne pré-connecte. `next/font/google` télécharge les fichiers
 * au build, les sert depuis l'origine, et n'expose que la variable CSS que `@theme`
 * consomme. Les axes demandés sont ceux de l'ancienne URL : IM Fell English en romain et
 * italique, Fira Code en 400 et 500.
 */
const imFellEnglish = IM_Fell_English({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-im-fell-english',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fira-code',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LogLense',
  description:
    'WarcraftLogs analyser for DPS specs — compare a parse against a field of comparable logs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${imFellEnglish.variable} ${firaCode.variable}`}>
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
