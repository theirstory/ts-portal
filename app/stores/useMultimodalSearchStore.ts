import { create } from 'zustand';
import type { MultimodalResult, SearchMode, SourceType } from '@/lib/weaviate/multimodalSearch';

export const ALL_SOURCE_TYPES: SourceType[] = ['recording', 'document', 'image'];

type MultimodalSearchState = {
  query: string;
  results: MultimodalResult[];
  /** How many candidates each source type contributed before merging. */
  perTypeCounts: Record<SourceType, number>;
  /** Which source types the user has enabled. Empty is treated as "all". */
  activeSourceTypes: SourceType[];
  loading: boolean;
  hasSearched: boolean;
  error: string | null;
  /** The exhibit page opened in the detail view, if any. */
  selectedResult: MultimodalResult | null;
  /** Shows the numeric score beside each relevance bar. */
  showScores: boolean;
  /** True while showing the unranked browse listing rather than search results. */
  browsing: boolean;
  /** Semantic (vector) or keyword (BM25) retrieval. */
  mode: SearchMode;

  setQuery: (query: string) => void;
  setMode: (mode: SearchMode) => void;
  browse: () => Promise<void>;
  toggleSourceType: (sourceType: SourceType) => void;
  setSelectedResult: (result: MultimodalResult | null) => void;
  toggleShowScores: () => void;
  search: () => Promise<void>;
  clear: () => void;
};

export const useMultimodalSearchStore = create<MultimodalSearchState>((set, get) => ({
  query: '',
  results: [],
  perTypeCounts: { recording: 0, document: 0, image: 0 },
  activeSourceTypes: [...ALL_SOURCE_TYPES],
  loading: false,
  hasSearched: false,
  error: null,
  selectedResult: null,
  showScores: true,
  browsing: false,
  mode: 'semantic',

  setQuery: (query) => set({ query }),

  setMode: (mode) => {
    if (get().mode === mode) return;
    set({ mode });

    // Re-run rather than leave results that came from the other retrieval on screen.
    if (get().hasSearched && get().query.trim()) {
      void get().search();
    }
  },

  toggleSourceType: (sourceType) => {
    const { activeSourceTypes } = get();
    const next = activeSourceTypes.includes(sourceType)
      ? activeSourceTypes.filter((type) => type !== sourceType)
      : [...activeSourceTypes, sourceType];

    set({ activeSourceTypes: next });

    // Re-run against the new filter so the counts and ordering stay truthful, rather than
    // filtering a stale result set client-side.
    if (!next.length) return;

    if (get().hasSearched && get().query.trim()) {
      void get().search();
    } else if (get().browsing) {
      void get().browse();
    }
  },

  browse: async () => {
    const { activeSourceTypes } = get();
    set({ loading: true, error: null });

    try {
      const response = await fetch('/api/search/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTypes: activeSourceTypes.length ? activeSourceTypes : ALL_SOURCE_TYPES,
          limit: 60,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `Browse failed (HTTP ${response.status})`);

      set({
        results: body.results ?? [],
        perTypeCounts: body.perTypeCounts ?? { recording: 0, document: 0, image: 0 },
        browsing: true,
        hasSearched: false,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        browsing: false,
        error: error instanceof Error ? error.message : 'Browse failed',
      });
    }
  },

  setSelectedResult: (result) => set({ selectedResult: result }),

  toggleShowScores: () => set({ showScores: !get().showScores }),

  search: async () => {
    const { query, activeSourceTypes, mode } = get();
    const trimmed = query.trim();

    if (!trimmed) {
      set({ results: [], hasSearched: false, error: null });
      return;
    }

    set({ loading: true, error: null });

    try {
      const response = await fetch('/api/search/multimodal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          sourceTypes: activeSourceTypes.length ? activeSourceTypes : ALL_SOURCE_TYPES,
          mode,
          limit: 40,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error || `Search failed (HTTP ${response.status})`);
      }

      const results = body.results ?? [];

      set({
        results,
        perTypeCounts: body.perTypeCounts ?? { recording: 0, document: 0, image: 0 },
        hasSearched: true,
        browsing: false,
        loading: false,
      });

      // Warm the passage cache for the top page result. Locating a passage costs a model
      // round-trip of about a second; doing it now, for the result most likely to be opened,
      // usually means the highlight is already waiting by the time it is.
      if (mode === 'semantic') {
        const firstPage = results.find(
          (result: MultimodalResult) => result.sourceType !== 'recording' && result.imageUrl,
        );

        if (firstPage) {
          void fetch('/api/search/passages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: firstPage.imageUrl, query: trimmed }),
          }).catch(() => {
            // A failed prefetch costs nothing; the drawer will ask again.
          });
        }
      }
    } catch (error) {
      set({
        loading: false,
        hasSearched: true,
        results: [],
        error: error instanceof Error ? error.message : 'Search failed',
      });
    }
  },

  clear: () => {
    set({
      query: '',
      results: [],
      perTypeCounts: { recording: 0, document: 0, image: 0 },
      hasSearched: false,
      browsing: false,
      error: null,
      selectedResult: null,
    });

    // Clearing a search returns to the browse listing rather than an empty page.
    void get().browse();
  },
}));
