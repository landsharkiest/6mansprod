/**
 * Shared Suspense fallback for lazily-loaded routes. Reuses the existing `.spinner` styling
 * (dark-theme CSS vars, already used for in-page loading states) inside the same `.page
 * container` wrapper the real pages render into, so route transitions don't visibly jump.
 */
export function RouteFallback() {
  return (
    <div className="page container">
      <div className="spinner" />
    </div>
  );
}
