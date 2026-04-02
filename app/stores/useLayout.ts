import { create } from 'zustand';

interface LayoutState {
  isTopBarCollapsed: boolean;
  hasManualTopBarPreference: boolean;
  setTopBarCollapsedAuto: (isTopBarCollapsed: boolean) => void;
  setTopBarCollapsedManual: (isTopBarCollapsed: boolean) => void;
  resetTopBarPreference: () => void;
}

const useLayoutState = create<LayoutState>((set) => ({
  isTopBarCollapsed: false,
  hasManualTopBarPreference: false,
  setTopBarCollapsedAuto: (isTopBarCollapsed) =>
    set((state) => {
      if (state.hasManualTopBarPreference || state.isTopBarCollapsed === isTopBarCollapsed) {
        return state;
      }

      return { isTopBarCollapsed };
    }),
  setTopBarCollapsedManual: (isTopBarCollapsed) =>
    set((state) =>
      state.isTopBarCollapsed === isTopBarCollapsed && state.hasManualTopBarPreference
        ? state
        : { isTopBarCollapsed, hasManualTopBarPreference: true },
    ),
  resetTopBarPreference: () =>
    set((state) => (state.hasManualTopBarPreference ? { hasManualTopBarPreference: false } : state)),
}));

export default useLayoutState;
