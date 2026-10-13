export default function LoadingSkeleton({ className = "" }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

export function CardSkeleton({ className = "" }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-xl h-32 ${className}`}></div>
  );
}

export function ListSkeleton({ count = 3, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-white rounded-xl border border-border">
          <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-2"></div>
            <div className="h-2 bg-gray-200 rounded w-1/2"></div>
          </div>
          <div className="h-4 bg-gray-200 rounded w-16"></div>
        </div>
      ))}
    </div>
  );
}
