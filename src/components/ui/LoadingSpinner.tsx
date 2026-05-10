export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--gold-dim)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '14px',
          height: '14px',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--gold)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      {label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
