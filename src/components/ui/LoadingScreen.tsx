import { LoadingSpinner } from './LoadingSpinner';

interface LoadingScreenProps {
  label?: string;
}

/**
 * L'attente qui occupe toute la surface : le repli de `<Suspense>`, et les deux moments où
 * `HomeClient` n'a encore ni session ni analyse à montrer.
 *
 * La région vive est ici et non dans `LoadingSpinner` : le rail de boss en affiche huit à la
 * fois, et huit régions vives concurrentes noieraient l'annonce au lieu de la porter. Un écran
 * d'attente, lui, est seul par définition — c'est le bon endroit pour dire qu'il se passe
 * quelque chose plutôt que de laisser un écran muet passer pour une panne.
 */
export function LoadingScreen({ label = 'Loading…' }: LoadingScreenProps) {
  return (
    <div role="status" className="flex h-full items-center justify-center">
      <LoadingSpinner label={label} />
    </div>
  );
}
