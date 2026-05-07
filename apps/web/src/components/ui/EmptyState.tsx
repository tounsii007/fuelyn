// ============================================================
// EmptyState — Placeholder for empty lists and error states
// ============================================================

'use client';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon = '⛽', title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <span className="text-5xl mb-4" role="img" aria-hidden="true">
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-6">
        {message}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl
                     hover:bg-brand-700 active:bg-brand-800 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
