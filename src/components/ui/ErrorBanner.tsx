export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--crimson)',
        borderRadius: '4px',
        padding: '10px 14px',
        color: 'var(--crimson)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem',
        backgroundColor: 'rgba(192,57,43,0.08)',
      }}
    >
      {message}
    </div>
  );
}
