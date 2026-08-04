export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border-danger text-danger bg-danger/10 rounded-sm border px-4 py-3 font-mono text-xs">
      {message}
    </div>
  );
}
