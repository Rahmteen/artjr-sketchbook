import { create } from 'zustand';
import type { Sketch } from '../types/sketch';

interface SketchState {
  sketches: Sketch[];
  setSketches: (sketches: Sketch[]) => void;
  addSketch: (sketch: Sketch) => void;
  updateSketch: (id: string, patch: Partial<Sketch>) => void;
  removeSketch: (id: string) => void;
}

export const useSketchStore = create<SketchState>((set) => ({
  sketches: [],

  setSketches: (sketches) => set({ sketches }),

  addSketch: (sketch) =>
    set((state) => ({
      sketches: [sketch, ...state.sketches],
    })),

  updateSketch: (id, patch) =>
    set((state) => ({
      sketches: state.sketches.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
    })),

  removeSketch: (id) =>
    set((state) => ({
      sketches: state.sketches.filter((s) => s.id !== id),
    })),
}));
