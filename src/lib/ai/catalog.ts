/**
 * Les fournisseurs d'IA, en un seul endroit.
 *
 * Le module est du texte et des booléens, sans `'use client'` ni import de React : la route
 * du chat en lit la liste des fournisseurs outillés, les composants en lisent les libellés.
 * La table vivait dans `AIReportTab` et la liste fermée dans la route du rapport — deux
 * copies qu'il fallait penser à faire diverger ensemble, et un fournisseur ajouté d'un côté
 * seulement s'y voyait proposé sans être accepté.
 */
export type Provider = 'claude' | 'gemini' | 'groq' | 'openai';

export interface ProviderInfo {
  id: Provider;
  label: string;
  keyLabel: string;
  placeholder: string;
  keyHint: string;
  /** Où la clé personnelle est retenue dans le navigateur. */
  storageKey: string;
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
  {
    id: 'groq',
    label: 'Groq',
    keyLabel: 'Groq API Key',
    placeholder: 'gsk_…',
    keyHint: 'console.groq.com — free tier',
    storageKey: 'loglense_groq_key',
    envVar: 'GROQ_API_KEY',
    toolCapable: false,
  },
  {
    id: 'gemini',
    label: 'Gemini Flash',
    keyLabel: 'Google AI Studio Key',
    placeholder: 'AIza…',
    keyHint: 'aistudio.google.com — free tier',
    storageKey: 'loglense_gemini_key',
    envVar: 'GEMINI_API_KEY',
    toolCapable: true,
  },
  {
    id: 'claude',
    label: 'Claude',
    keyLabel: 'Anthropic API Key',
    placeholder: 'sk-ant-…',
    keyHint: 'console.anthropic.com',
    storageKey: 'loglense_api_key',
    envVar: 'ANTHROPIC_API_KEY',
    toolCapable: true,
  },
  {
    id: 'openai',
    label: 'ChatGPT',
    keyLabel: 'OpenAI API Key',
    placeholder: 'sk-…',
    keyHint: 'platform.openai.com',
    storageKey: 'loglense_openai_key',
    envVar: 'OPENAI_API_KEY',
    toolCapable: true,
  },
];

/** Ceux que le chat accepte. Dérivé, jamais réécrit à la main. */
export const CHAT_PROVIDERS = PROVIDERS.filter((p) => p.toolCapable);

export function isProvider(v: string): v is Provider {
  return PROVIDERS.some((p) => p.id === v);
}

export function isChatProvider(v: string): v is Provider {
  return CHAT_PROVIDERS.some((p) => p.id === v);
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

/** La fiche d'un fournisseur. Jette sur un nom inconnu — la table est exhaustive par type. */
export function providerInfo(id: Provider): ProviderInfo {
  const info = PROVIDERS.find((p) => p.id === id);
  if (!info) throw new Error(`Unknown provider: ${id}`);
  return info;
}
