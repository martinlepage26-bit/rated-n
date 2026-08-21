export default function Toast({ toast }) {
  if (!toast) return null;
  return <div className="toast" role="status" aria-live="polite">{toast}</div>;
}
