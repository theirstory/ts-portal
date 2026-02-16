import { create } from 'zustand';

type RangeState = {
  minValue: number;
  maxValue: number;
  setMinValue: (value: number) => void;
  setMaxValue: (value: number) => void;
  setRange: (min: number, max: number) => void;
  resetRange: () => void;
};

export const useThreshold = create<RangeState>((set) => ({
  minValue: 0.4,
  maxValue: 1,
  setMinValue: (value) => set({ minValue: value }),
  setMaxValue: (value) => set({ maxValue: value }),
  setRange: (min, max) => set({ minValue: min, maxValue: max }),
  resetRange: () => set({ minValue: 0.4, maxValue: 1 }),
}));
