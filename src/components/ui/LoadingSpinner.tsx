export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <span className="text-muted inline-flex items-center gap-2 font-mono text-xs">
      <span className="border-border border-t-brass inline-block h-3.5 w-3.5 animate-spin rounded-full border-2" />
      {label}
    </span>
  );
}
