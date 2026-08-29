import { getServerSession } from 'next-auth/next';
import { notFound, redirect } from 'next/navigation';
import { AccessAdmin } from '@/components/admin/AccessAdmin';
import { isAdminTag } from '@/lib/access';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * L'écran d'administration de l'accès.
 *
 * Il ne passe pas par `AppShell` : cette coquille rend la page d'accueil marchande à qui
 * n'est pas connecté, or ici l'absence de droit n'est pas une invitation à s'inscrire. Le
 * garde est donc rendu côté serveur, avant tout HTML.
 *
 * Deux issues distinctes, et la distinction est délibérée. Sans session, on renvoie à
 * l'accueil : c'est l'administrateur qui n'a simplement pas encore ouvert sa session, et le
 * 404 lui ferait croire à une page disparue. Avec une session mais sans droit, 404 sec —
 * répondre « interdit » confirmerait l'existence d'une liste d'administrateurs à deviner.
 */
export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const tag = session?.user?.name ?? '';

  if (tag === '') redirect('/');
  if (!isAdminTag(tag)) notFound();

  return <AccessAdmin admin={tag} />;
}
