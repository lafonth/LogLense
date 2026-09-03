'use client';

import type { Provider } from '@/lib/ai/catalog';
import { useEffect, useState } from 'react';

/**
 * Les fournisseurs qu'une route d'IA annonce servir, et celui que l'écran a choisi.
 *
 * C'est le serveur qui arbitre, pas le catalogue : depuis le retrait du BYOK, un fournisseur
 * sans clé posée chez nous n'est plus une invitation à en apporter une, c'est un 401 garanti.
 * Le client rend donc ce que la route lui répond, et rien d'autre.
 *
 * Le choix n'est pas mémorisé d'une visite à l'autre. Il l'était du temps où quatre
 * fournisseurs se valaient et où chacun payait le sien ; la bêta n'en offre qu'un, et un nom
 * relu du navigateur pourrait désigner celui que le déploiement a retiré depuis.
 *
 * `provider` vaut `null` tant que la réponse n'est pas arrivée, ou si la route ne sert rien —
 * les deux cas où l'écran ne doit pas laisser envoyer.
 *
 * @param endpoint La route à interroger. `/api/chat` et `/api/ai-report` ne répondent pas la
 *                 même liste : le rapport annonce aussi Groq, que le chat ne sert pas.
 */
export function useServedProviders(endpoint: '/api/ai-report' | '/api/chat') {
  const [served, setServed] = useState<Provider[]>([]);
  const [chosen, setChosen] = useState<Provider | null>(null);

  useEffect(() => {
    fetch(endpoint)
      .then((r) => r.json())
      .then((d: { providers: Provider[] }) => setServed(d.providers ?? []))
      .catch(() => {});
  }, [endpoint]);

  // Le choix est confronté à la liste plutôt que rendu tel quel : entre le clic et l'envoi, la
  // liste peut avoir changé de forme, et un nom qu'elle ne porte plus est refusé en 400.
  const provider = chosen && served.includes(chosen) ? chosen : (served[0] ?? null);

  return { served, provider, setProvider: setChosen };
}
