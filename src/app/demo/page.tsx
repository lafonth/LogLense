import type { Metadata } from 'next';
import { DemoScreen } from '@/components/demo/DemoScreen';

/**
 * La seule route rendue hors d'`AppShell`, et la seule qui s'indexe avec son contenu.
 *
 * La frontière tenue par `AppShell` porte sur les analyses **vivantes** : publier ce que
 * Warcraft Logs nous rend, à la demande et pour n'importe qui, ferait de LogLense une
 * publication concurrente d'Archon. Cette page ne le fait pas — elle rend une fixture du
 * dépôt, anonymisée, sans une requête à WCL ni à Redis. Il n'y a donc rien à protéger
 * derrière la session, et tout à montrer avant elle.
 */
export const metadata: Metadata = {
  title: 'A real analysis — LogLense',
  description:
    'One real Warcraft Logs analysis, played out in full: the reference bench, what it filtered out, and the gap that survives.',
};

export default function Page() {
  return <DemoScreen />;
}
