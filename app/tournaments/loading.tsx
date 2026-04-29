function TournamentCardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800 mb-3" />
      <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800 mb-4" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
        <div className="h-3 rounded bg-gray-100 dark:bg-gray-900" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="container-app py-8">
      <div className="mb-8 animate-pulse">
        <div className="h-8 w-40 rounded bg-gray-200 dark:bg-gray-800 mb-2" />
        <div className="h-4 w-72 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <div className="h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div className="h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div className="h-10 rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <TournamentCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
