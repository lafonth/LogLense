import type { TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

/**
 * Le pendant multi-ligne de `Input`, ajouté pour la question du chat.
 *
 * En `font-sans` là où `Input` est en `font-mono` : ce qu'on saisit ici est une phrase, pas un
 * identifiant ni une clé. C'est la même exception que le corps du rapport IA.
 */
export function Textarea({ label, error, className = '', rows = 3, ...rest }: TextareaProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-2xs text-muted font-sans tracking-widest uppercase">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`bg-surface text-text placeholder:text-dim focus-visible:outline-brass-bright resize-y rounded-sm border px-3 py-2 font-sans text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-2xs text-danger font-sans">
          {error}
        </p>
      )}
    </div>
  );
}
