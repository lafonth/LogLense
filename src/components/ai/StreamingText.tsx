interface StreamingTextProps {
  text: string;
  loading: boolean;
}

export function StreamingText({ text, loading }: StreamingTextProps) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem',
        lineHeight: '1.7',
        color: 'var(--text)',
        whiteSpace: 'pre-wrap',
        minHeight: '120px',
      }}
    >
      {text}
      {loading && (
        <span
          style={{
            display: 'inline-block',
            width: '2px',
            height: '1.1em',
            background: 'var(--gold)',
            verticalAlign: 'text-bottom',
            marginLeft: '2px',
            animation: 'blink 1s step-end infinite',
          }}
        />
      )}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}
