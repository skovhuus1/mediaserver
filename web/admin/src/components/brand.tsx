export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      {!compact && <span><strong>BoltBytes</strong><small>MEDIA SERVER</small></span>}
    </div>
  );
}
