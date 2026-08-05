interface StreamingTextProps {
  text: string;
  loading: boolean;
}

export function StreamingText({ text, loading }: StreamingTextProps) {
  return (
    <div className="text-text min-h-30 max-w-[70ch] font-sans text-sm leading-relaxed whitespace-pre-wrap">
      {text}
      {loading && (
        <span className="bg-brass ml-0.5 inline-block h-4 w-0.5 animate-pulse align-text-bottom" />
      )}
    </div>
  );
}
