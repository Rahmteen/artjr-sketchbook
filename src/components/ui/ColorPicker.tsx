import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE_OUT_EXPO } from './Motion';

export const TIER_COLORS: { key: string; hex: string; bg: string }[] = [
  { key: 'violet', hex: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
  { key: 'blue', hex: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
  { key: 'teal', hex: '#14B8A6', bg: 'rgba(20, 184, 166, 0.15)' },
  { key: 'emerald', hex: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
  { key: 'amber', hex: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  { key: 'rose', hex: '#F43F5E', bg: 'rgba(244, 63, 94, 0.15)' },
  { key: 'pink', hex: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' },
  { key: 'orange', hex: '#F97316', bg: 'rgba(249, 115, 22, 0.15)' },
  { key: 'cyan', hex: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)' },
  { key: 'lime', hex: '#84CC16', bg: 'rgba(132, 204, 22, 0.15)' },
];

export function getTierColor(colorKey: string | null) {
  return TIER_COLORS.find((c) => c.key === colorKey) ?? null;
}

interface ColorPickerProps {
  value: string | null;
  onChange: (colorKey: string | null) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getTierColor(value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-5 h-5 rounded-full border-2 border-border hover:border-border-hover transition-colors shrink-0"
        style={{ backgroundColor: current?.hex ?? 'rgba(255,255,255,0.1)' }}
        aria-label="Pick color"
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-md bg-elevated border border-border shadow-modal z-20"
          >
            <div className="grid grid-cols-5 gap-1.5">
              {TIER_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { onChange(c.key); setOpen(false); }}
                  className={`w-6 h-6 rounded-full transition-all ${
                    value === c.key ? 'ring-2 ring-offset-1 ring-offset-base scale-110' : 'hover:scale-110'
                  }`}
                  style={{
                    backgroundColor: c.hex,
                    ...(value === c.key ? { ringColor: c.hex } as Record<string, string> : {}),
                  }}
                  aria-label={c.key}
                />
              ))}
            </div>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full mt-1.5 text-xs text-tertiary hover:text-text transition-colors text-center py-1"
              >
                Remove color
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
