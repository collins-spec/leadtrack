'use client';

import { X } from 'lucide-react';

interface TagBadgeProps {
  label: string;
  color: string;
  onRemove?: () => void;
  removable?: boolean;
}

const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
  '#10b981': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' }, // green
  '#ef4444': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' }, // red
  '#6b7280': { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' }, // gray
  '#3b82f6': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }, // blue
  '#f59e0b': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' }, // yellow
  '#f97316': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' }, // orange
  '#8b5cf6': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' }, // purple
  '#64748b': { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' }, // slate
};

export function TagBadge({ label, color, onRemove, removable = true }: TagBadgeProps) {
  const classes = colorClasses[color] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${classes.bg} ${classes.text} ${classes.border}`}
    >
      {label}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove ${label} tag`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
