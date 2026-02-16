import { create } from 'zustand';

interface TranscriptPanelState {
  expandedSections: Record<number, boolean>;
  isCurrentTimeOutOfView: boolean;
  setIsCurrentTimeOutOfView: (value: boolean) => void;
  targetScrollTime: number | null;
  setTargetScrollTime: (time: number | null) => void;
  expandAll: () => void;
  collapseAll: () => void;
  areAllExpanded: () => boolean;
  toggleSection: (startTime: number) => void;
  initializeExpandedSections: (sections: number[]) => void;
}

export const useTranscriptPanelStore = create<TranscriptPanelState>((set, get) => ({
  expandedSections: {},

  isCurrentTimeOutOfView: false,
  setIsCurrentTimeOutOfView: (value) => set({ isCurrentTimeOutOfView: value }),

  targetScrollTime: null,
  setTargetScrollTime: (time) => set({ targetScrollTime: time }),

  expandAll: () => {
    const times = Object.keys(get().expandedSections).map(Number);
    const newState = times.reduce(
      (acc, time) => {
        acc[time] = true;
        return acc;
      },
      {} as Record<number, boolean>,
    );
    set({ expandedSections: newState });
  },

  collapseAll: () => {
    const times = Object.keys(get().expandedSections).map(Number);
    const newState = times.reduce(
      (acc, time) => {
        acc[time] = false;
        return acc;
      },
      {} as Record<number, boolean>,
    );
    set({ expandedSections: newState });
  },

  areAllExpanded: () => {
    const sections = get().expandedSections;
    return Object.values(sections).length > 0 && Object.values(sections).every((v) => v);
  },
  initializeExpandedSections: (sections: number[]) => {
    const initialState = sections.reduce(
      (acc, time) => {
        acc[time] = true;
        return acc;
      },
      {} as Record<number, boolean>,
    );
    set({ expandedSections: initialState });
  },
  toggleSection: (startTime: number) => {
    const current = get().expandedSections[startTime];
    set((state) => ({
      expandedSections: {
        ...state.expandedSections,
        [startTime]: !current,
      },
    }));
  },
}));
