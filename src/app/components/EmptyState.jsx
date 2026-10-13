export default function EmptyState({ title = "No data", description = "", action = null }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <h3 className="text-base font-medium text-text-primary mb-2">{title}</h3>
      {description && <p className="text-sm text-text-secondary mb-4">{description}</p>}
      {action}
    </div>
  );
}
