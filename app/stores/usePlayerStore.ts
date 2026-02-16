import MuxPlayerElement from '@mux/mux-player';
import { create } from 'zustand';

interface PlayerState {
  play: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  setPlay: (play: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  seekTo: (time: number) => void;
  setPlayerRef: (ref: MuxPlayerElement | null) => void;
  playerRef: MuxPlayerElement | null;
}

const usePlayerStore = create<PlayerState>((set) => ({
  play: false,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  playerRef: null,
  setPlay: (play) => set({ play }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
  seekTo: (time) => {
    set((state) => {
      if (state.playerRef?.currentTime !== undefined) {
        state.playerRef.currentTime = time;
      }
      return { currentTime: time };
    });
  },
}));

export default usePlayerStore;
