interface SkeletonLineProps {
  className?: string;
  width?: string;
  height?: string;
}

export function SkeletonLine({ className = '', width = '100%', height = '16px' }: SkeletonLineProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card p-6 space-y-4 ${className}`}>
      <SkeletonLine width="60%" height="20px" />
      <SkeletonLine width="40%" height="14px" />
      <SkeletonLine width="80%" height="14px" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-6 px-6 py-4 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={i === 0 ? '30%' : '15%'} height="12px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-6 px-6 py-4 border-b border-border last:border-0">
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonLine key={col} width={col === 0 ? '40%' : '12%'} height="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
