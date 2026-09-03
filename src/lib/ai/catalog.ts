/**
 * Les fournisseurs d'IA, en un seul endroit.
 *
 * Le module est du texte et des booléens, sans `'use client'` ni import de React : les routes
 * y lisent ce qu'elles acceptent, les composants les libellés de ce que le serveur annonce.
 * La table vivait dans `AIReportTab` et la liste fermée dans la route du rapport — deux
 * copies qu'il fallait penser à faire diverger ensemble, et un fournisseur ajouté d'un côté
 * seulement s'y voyait proposé sans être accepté.
 *
 * Depuis le retrait du BYOK, une fiche ne porte plus rien qui décrive une clé personnelle :
 * plus de libellé de champ, plus de gabarit, plus de clé de stockage navigateur. Le seul
 * secret que le produit connaisse est le nôtre, et il vit dans `process.env`.
 */
export type Provider = 'claude' | 'gemini' | 'groq' | 'openai';

export interface ProviderInfo {
  id: Provider;
  label: string;
  /** Nom de la variable d'environnement de la clé serveur. */
  envVar: string;
  /**
   * Implémente `streamTurn`, donc admissible au chat.
   *
   * Groq ne l'est pas : les modèles servis là-bas rendent des appels d'outil trop irréguliers
   * pour une boucle qui dépense chez Warcraft Logs. Le rapport one-shot, lui, n'a pas d'outils
   * et reste ouvert à tous.
   */
  toolCapable: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY', toolCapable: false },
  { id: 'gemini', label: 'Gemini Flash', envVar: 'GEMINI_API_KEY', toolCapable: true },
  { id: 'claude', label: 'Claude', envVar: 'ANTHROPIC_API_KEY', toolCapable: true },
  { id: 'openai', label: 'ChatGPT', envVar: 'OPENAI_API_KEY', toolCapable: true },
];

/** Ceux que le chat accepte. Dérivé, jamais réécrit à la main. */
export const CHAT_PROVIDERS = PROVIDERS.filter((p) => p.toolCapable);

/**
 * Ce que la bêta propose par défaut. Un seul nom : c'est nous qui payons désormais, et un
 * produit qui parle de la rotation d'un joueur doit le faire avec une voix, pas quatre.
 */
export const DEFAULT_OFFERED: Provider[] = ['claude'];

export function isProvider(v: string): v is Provider {
  return PROVIDERS.some((p) => p.id === v);
}

export function isChatProvider(v: string): v is Provider {
  return CHAT_PROVIDERS.some((p) => p.id === v);
}

/**
 * Les fournisseurs que ce déploiement veut bien servir, dans l'ordre où il les nomme.
 *
 * Le catalogue entier reste dans le code — il a coûté quatre implémentations de `streamTurn`
 * et sert à comparer les coûts — mais il n'est plus offert : `AI_PROVIDERS` l'ouvre, un nom
 * par entrée, et son absence ne laisse passer que Claude. Un nom inconnu est ignoré plutôt
 * que fatal : une faute de frappe dans une variable d'environnement ne doit ni ouvrir le
 * catalogue entier ni fermer les routes d'IA.
 *
 * Lit `process.env` : à n'appeler que côté serveur. Le client n'en lit jamais le résultat
 * qu'à travers le `GET` des deux routes, qui l'a déjà croisé avec les clés réellement posées.
 */
export function offeredProviders(): Provider[] {
  const raw = process.env.AI_PROVIDERS?.trim();
  if (!raw) return DEFAULT_OFFERED;

  const named = raw
    .split(',')
    .map((s) => s.trim())
    .filter(isProvider);

  return named.length > 0 ? [...new Set(named)] : DEFAULT_OFFERED;
}

/**
 * La clé serveur d'un fournisseur, ou la chaîne vide.
 *
 * Lit `process.env` par nom : à n'appeler que côté serveur, où le bundle client ne remplace
 * pas l'accès par une constante.
 */
export function envKeyFor(provider: Provider): string {
  const info = PROVIDERS.find((p) => p.id === provider);
  return (info ? process.env[info.envVar] : '') ?? '';
}

/**
 * Ce qu'une route peut réellement servir : offert par le déploiement **et** muni d'une clé.
 *
 * Les deux `GET` en font leur réponse et les deux `POST` leur liste fermée — c'est la même
 * question, et la poser deux fois différemment rouvrirait l'écart que ce module a fermé :
 * un fournisseur proposé à l'écran que la route refuse.
 */
export function servableProviders(among: ProviderInfo[] = PROVIDERS): Provider[] {
  const ids = new Set(among.map((p) => p.id));
  return offeredProviders().filter((id) => ids.has(id) && envKeyFor(id) !== '');
}

/** La fiche d'un fournisseur. Jette sur un nom inconnu — la table est exhaustive par type. */
export function providerInfo(id: Provider): ProviderInfo {
  const info = PROVIDERS.find((p) => p.id === id);
  if (!info) throw new Error(`Unknown provider: ${id}`);
  return info;
}
