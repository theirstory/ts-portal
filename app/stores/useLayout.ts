import { create } from 'zustand';

interface LayoutState {
  isTopBarCollapsed: boolean;
  setTopBarCollapsed: (isTopBarCollapsed: boolean) => void;
}

const useLayoutState = create<LayoutState>((set) => ({
  isTopBarCollapsed: false,
  setTopBarCollapsed: (isTopBarCollapsed) => set({ isTopBarCollapsed }),
}));

export default useLayoutState;
