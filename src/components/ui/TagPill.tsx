import { X } from 'lucide-react';

const TAG_COLORS = [
  { bg: 'rgba(139, 92, 246, 0.15)', text: '#A78BFA' },  // violet
  { bg: 'rgba(59, 130, 246, 0.15)', text: '#60A5FA' },   // blue
  { bg: 'rgba(20, 184, 166, 0.15)', text: '#2DD4BF' },   // teal
  { bg: 'rgba(16, 185, 129, 0.15)', text: '#34D399' },    // emerald
  { bg: 'rgba(245, 158, 11, 0.15)', text: '#FBBF24' },    // amber
  { bg: 'rgba(244, 63, 94, 0.15)', text: '#FB7185' },     // rose
  { bg: 'rgba(236, 72, 153, 0.15)', text: '#F472B6' },    // pink
  { bg: 'rgba(249, 115, 22, 0.15)', text: '#FB923C' },    // orange
  { bg: 'rgba(6, 182, 212, 0.15)', text: '#22D3EE' },     // cyan
  { bg: 'rgba(132, 204, 22, 0.15)', text: '#A3E635' },    // lime
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getTagColor(name: string) {
  return TAG_COLORS[hashString(name) % TAG_COLORS.length];
}

interface TagPillProps {
  name: string;
  onRemove?: () => void;
  className?: string;
}

export function TagPill({ name, onRemove, className = '' }: TagPillProps) {
  const color = getTagColor(name);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
          aria-label={`Remove tag ${name}`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
