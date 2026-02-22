import { Word } from '@/types/transcription';
import { create } from 'zustand';

export type SearchMatch = Word & {
  nerMetadata?: {
    start_time: number;
    end_time: number;
    label: string;
    text: string;
  };
};

type SearchState = {
  searchTerm: string;
  matches: SearchMatch[];
  currentMatchIndex: number;
  isSearching: boolean;

  runSearch: (words: Word[]) => SearchMatch[];
  setSearchTerm: (term: string) => void;
  setIsSearching: (value: boolean) => void;
  setMatches: (matches: SearchMatch[]) => void;
  setCurrentMatchIndex: (index: number) => void;
  nextMatch: () => void;
  previousMatch: () => void;
  clearSearch: () => void;
  addElementToMatch: (matchIndex: number, element: string) => void;
};

export const useSearchStore = create<SearchState>((set, get) => ({
  searchTerm: '',
  matches: [],
  currentMatchIndex: -1,
  isSearching: false,

  setSearchTerm: (term: string) => {
    set({
      searchTerm: term,
      isSearching: term.length > 0,
      currentMatchIndex: term.length > 0 ? 0 : -1,
    });
  },

  runSearch: (words) => {
    const { searchTerm } = get();

    const trimmedTerm = searchTerm.trim().toLowerCase();
    if (!trimmedTerm) {
      set({
        matches: [],
        currentMatchIndex: -1,
        isSearching: false,
      });
      return [];
    }

    const matches: SearchMatch[] = words.filter((word) => word.text.toLowerCase().includes(trimmedTerm));

    set({
      matches,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
      isSearching: false,
    });
    return matches;
  },

  setMatches: (matches: SearchMatch[]) => {
    set({
      matches,
      currentMatchIndex: matches.length > 0 ? 0 : -1,
    });
  },

  setCurrentMatchIndex: (index: number) => {
    const { matches } = get();
    if (index >= 0 && index < matches.length) {
      set({ currentMatchIndex: index });
    }
  },

  nextMatch: () => {
    const { matches, currentMatchIndex } = get();
    if (matches.length > 0) {
      const nextIndex = (currentMatchIndex + 1) % matches.length;
      set({ currentMatchIndex: nextIndex });
    }
  },

  previousMatch: () => {
    const { matches, currentMatchIndex } = get();
    if (matches.length > 0) {
      const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1;
      set({ currentMatchIndex: prevIndex });
    }
  },

  clearSearch: () => {
    set({
      searchTerm: '',
      matches: [],
      currentMatchIndex: -1,
      isSearching: false,
    });
  },

  addElementToMatch: (matchIndex: number, element: string) => {
    const { matches } = get();
    const updatedMatches = [...matches];
    if (updatedMatches[matchIndex]) {
      updatedMatches[matchIndex].text = element;
      set({ matches: updatedMatches });
    }
  },

  setIsSearching: (value) => set({ isSearching: value }),
}));
