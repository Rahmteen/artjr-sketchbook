import { LayoutGrid, List, Table2 } from 'lucide-react';

export type ViewMode = 'grid' | 'list' | 'table';

interface ViewSwitcherProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

const views: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { mode: 'grid', icon: LayoutGrid, label: 'Grid view' },
  { mode: 'list', icon: List, label: 'List view' },
  { mode: 'table', icon: Table2, label: 'Table view' },
];

export function ViewSwitcher({ mode, onChange, className = '' }: ViewSwitcherProps) {
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-full bg-surface p-1 ${className}`}>
      {views.map((v) => {
        const Icon = v.icon;
        const isActive = mode === v.mode;
        return (
          <button
            key={v.mode}
            type="button"
            onClick={() => onChange(v.mode)}
            aria-label={v.label}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150 ${
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-tertiary hover:text-text hover:bg-hover'
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
