import type { DefaultSession } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    accessToken?: string;
    /** Date du dernier verdict de la porte, en ms. Voir `ACCESS_RECHECK_MS` dans `auth.ts`. */
    accessCheckedAt?: number;
  }
}
