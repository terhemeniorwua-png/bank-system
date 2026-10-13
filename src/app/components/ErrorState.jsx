export default function ErrorState({ message = "Something went wrong", onRetry = null }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
      <p className="text-sm text-error mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-deep transition-colors text-sm"
        >
          Retry
        </button>
      )}
    </div>
  );
}
