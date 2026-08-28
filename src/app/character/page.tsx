import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/lib/routes';

/**
 * L'ancienne route du formulaire personnage. Elle ne rend plus rien : depuis que `/` **est**
 * cette question, deux URL pour un même écran n'apporteraient qu'un doublon à indexer et un
 * favori qui vieillit. Les liens déjà collés continuent d'arriver au bon endroit.
 */
export default function Page() {
  redirect(HOME_PATH);
}
