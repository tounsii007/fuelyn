// ============================================================
// EmptyState — Placeholder for empty lists and error states
// ============================================================

'use client';

import { Button } from './Button';

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
    <div
      className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in"
      role="status"
    >
      <span
        className="text-5xl mb-4 select-none drop-shadow-sm"
        role="img"
        aria-hidden="true"
      >
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400 max-w-xs mb-6">
        {message}
      </p>
      {action && (
        <Button onClick={action.onClick} size="md">
          {action.label}
        </Button>
      )}
    </div>
  );
}
