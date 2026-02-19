import { create } from 'zustand';

interface LayoutState {
  isTopBarCollapsed: boolean;
  setIsTopBarCollapsed: (isTopBarCollapsed: boolean) => void;
}

const useLayoutState = create<LayoutState>((set) => ({
  isTopBarCollapsed: false,
  setIsTopBarCollapsed: (isTopBarCollapsed) => set({ isTopBarCollapsed }),
}));

export default useLayoutState;
