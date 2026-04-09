import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { QueryProperty, WeaviateGenericObject, WeaviateReturn } from 'weaviate-client';
import {
  bm25Search,
  bm25SearchForStoryId,
  fetchStoryTranscriptByUuid,
  getAvailableCollections,
  getAvailableFolders,
  getAllStoriesFromCollection,
  getStoryByUuid,
  hybridSearch,
  hybridSearchForStoryId,
  vectorSearch,
  vectorSearchForStoryId,
  type CollectionFilterOption,
  type FolderFilterOption,
} from '@/lib/weaviate/search';
import { Chunks, Testimonies, SchemaMap, SchemaTypes } from '@/types/weaviate';
import { NerLabel } from '@/types/ner';
import { SearchType } from '@/types/searchType';
import { Transcription, Word } from '@/types/transcription';

type SemanticSearchStore = {
  hasSearched: boolean;
  searchType: SearchType;
  searchTerm: string;
  loading: boolean;
  stories: WeaviateReturn<Testimonies | Chunks, any> | null;
  story: WeaviateGenericObject<Chunks, any> | null;

  storyHubPage: WeaviateGenericObject<Testimonies, any> | null;
  transcript: Transcription | null;
  allWords: Word[] | null;
  isSemanticSearching: boolean;
  loadingSearch: boolean;
  selected_ner_labels: NerLabel[];
  matches: WeaviateGenericObject<Chunks, any>[];
  currentMatchIndex: number;
  result: WeaviateReturn<Chunks | Testimonies, any> | null;
  currentPage: number;
  hasNextStoriesPage: boolean;
  nerFilters: string[];
  collections: CollectionFilterOption[];
  folders: FolderFilterOption[];
  selectedCollectionIds: string[];
  selectedFolderIds: string[];
  setCollections: (collections: CollectionFilterOption[]) => void;
  setFolders: (folders: FolderFilterOption[]) => void;
  setSelectedCollectionIds: (collectionIds: string[]) => void;
  setSelectedFolderIds: (folderIds: string[]) => void;
  clearCollectionFilters: () => void;
  clearFolderFilters: () => void;
  loadCollections: () => Promise<void>;
  loadFolders: () => Promise<void>;
  setNerFilters: (filters: string[]) => void;
  setHasSearched: (searched: boolean) => void;
  setSearchTerm: (term: string) => void;
  setLoading: (loading: boolean) => void;
  getAllStories: <T extends SchemaTypes>(
    collection: T,
    returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
    limit?: number,
    offset?: number,
  ) => Promise<void>;
  getStoryByUuid: (uuid: string) => Promise<void>;
  getStoryTranscriptByUuid: (uuid: string) => Promise<void>;
  setIsSemanticSearching: (isSearching: boolean) => void;
  runVectorSearch: (
    collection: SchemaTypes,
    limit: number,
    offset: number,
    filter?: string[],
    returnProperties?: QueryProperty<SchemaMap[SchemaTypes]>[] | undefined,
    minValue?: number,
    maxValue?: number,
  ) => Promise<void>;
  runHybridSearch: (
    collection: SchemaTypes,
    limit: number,
    offset: number,
    filter?: string[],
    returnProperties?: QueryProperty<SchemaMap[SchemaTypes]>[] | undefined,
    minValue?: number,
    maxValue?: number,
  ) => Promise<void>;
  run25bmSearch: (
    collection: SchemaTypes,
    limit: number,
    offset: number,
    filter?: string[],
    returnProperties?: QueryProperty<SchemaMap[SchemaTypes]>[] | undefined,
    minValue?: number,
    maxValue?: number,
  ) => Promise<void>;
  runHybridSearchForStoryId: (
    collection: SchemaTypes,
    limit: number,
    nerFilters?: string[],
    minValue?: number,
    maxValue?: number,
  ) => Promise<void>;
  runVectorSearchForStoryId: (
    collection: SchemaTypes,
    limit: number,
    nerFilters?: string[],
    minValue?: number,
    maxValue?: number,
  ) => Promise<void>;
  run25bmSearchForStoryId: (
    collection: SchemaTypes,
    limit: number,
    nerFilters?: string[],
    minValue?: number,
    maxValue?: number,
  ) => Promise<void>;
  setIsSearching: (isSearching: boolean) => void;
  setLoadingSearch: (loading: boolean) => void;
  clearSearch: () => void;
  setAllWords: (words: Word[]) => void;
  nextMatch: () => void;
  previousMatch: () => void;
  setUpdateSelectedNerLabel: (label: NerLabel) => void;
  setSelectedNerLabels: (labels: NerLabel[]) => void;
  setSearchType: (type: SearchType) => void;
  setCurrentPage: (page: number) => void;
  clearStore: () => void;
};

function syncFilterSelections(
  folders: FolderFilterOption[],
  collectionIds: string[],
  folderIds: string[],
) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const normalizedCollectionIds = Array.from(new Set(collectionIds));
  const normalizedFolderIds = Array.from(new Set(folderIds));

  const selectedFolderCollectionIds = normalizedFolderIds
    .map((id) => foldersById.get(id)?.collectionId)
    .filter((id): id is string => Boolean(id));

  const nextCollectionIds = Array.from(new Set([...normalizedCollectionIds, ...selectedFolderCollectionIds]));

  const nextFolderIds =
    nextCollectionIds.length > 0
      ? normalizedFolderIds.filter((id) => {
          const folder = foldersById.get(id);
          return folder ? nextCollectionIds.includes(folder.collectionId) : false;
        })
      : normalizedFolderIds;

  return { nextCollectionIds, nextFolderIds };
}

export const useSemanticSearchStore = create<SemanticSearchStore>()(
  devtools(
    (set, get) => ({
      searchTerm: '',
      setSearchTerm: (term) => set({ searchTerm: term }, false, 'setSearchTerm'),

      loading: true,
      setLoading: (loading) => set({ loading }, false, 'setLoading'),

      result: null,
      transcript: null,
      loadingSearch: false,
      searchType: SearchType.bm25,
      matches: [],
      currentMatchIndex: -1,
      selected_ner_labels: [],
      currentPage: 1,
      hasNextStoriesPage: false,
      nerFilters: [],
      collections: [],
      folders: [],
      selectedCollectionIds: [],
      selectedFolderIds: [],
      hasSearched: false,

      setCollections: (collections: CollectionFilterOption[]) => set({ collections }, false, 'setCollections'),

      setFolders: (folders: FolderFilterOption[]) => set({ folders }, false, 'setFolders'),

      setSelectedCollectionIds: (selectedCollectionIds: string[]) => {
        const { nextCollectionIds, nextFolderIds } = syncFilterSelections(
          get().folders,
          selectedCollectionIds,
          get().selectedFolderIds,
        );
        set(
          { selectedCollectionIds: nextCollectionIds, selectedFolderIds: nextFolderIds },
          false,
          'setSelectedCollectionIds',
        );
      },

      setSelectedFolderIds: (selectedFolderIds: string[]) => {
        const { nextCollectionIds, nextFolderIds } = syncFilterSelections(
          get().folders,
          get().selectedCollectionIds,
          selectedFolderIds,
        );
        set(
          { selectedCollectionIds: nextCollectionIds, selectedFolderIds: nextFolderIds },
          false,
          'setSelectedFolderIds',
        );
      },

      clearCollectionFilters: () =>
        set({ selectedCollectionIds: [], selectedFolderIds: [] }, false, 'clearCollectionFilters'),

      clearFolderFilters: () => set({ selectedFolderIds: [] }, false, 'clearFolderFilters'),

      loadCollections: async () => {
        try {
          const collections = await getAvailableCollections();
          const collectionIds = new Set(collections.map((collection) => collection.id));
          const currentSelection = get().selectedCollectionIds.filter((id) => collectionIds.has(id));
          const { nextCollectionIds, nextFolderIds } = syncFilterSelections(
            get().folders,
            collections.length > 1 ? currentSelection : [],
            get().selectedFolderIds,
          );
          set(
            {
              collections,
              selectedCollectionIds: nextCollectionIds,
              selectedFolderIds: nextFolderIds,
            },
            false,
            'loadCollections:success',
          );
        } catch (error) {
          console.error('Error loading collections:', error);
        }
      },

      loadFolders: async () => {
        try {
          const folders = await getAvailableFolders();
          const folderIds = new Set(folders.map((folder) => folder.id));
          const currentSelection = get().selectedFolderIds.filter((id) => folderIds.has(id));
          const { nextCollectionIds, nextFolderIds } = syncFilterSelections(
            folders,
            get().selectedCollectionIds,
            currentSelection,
          );

          set(
            {
              folders,
              selectedCollectionIds: nextCollectionIds,
              selectedFolderIds: nextFolderIds,
            },
            false,
            'loadFolders:success',
          );
        } catch (error) {
          console.error('Error loading folders:', error);
        }
      },

      setHasSearched: (searched: boolean) => set({ hasSearched: searched }, false, 'setHasSearched'),

      setSearchType: (type: SearchType) => set({ searchType: type }, false, 'setSearchType'),

      getAllStories: async <T extends SchemaTypes>(
        collection: T,
        returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
        limit = 100,
        offset = 0,
      ) => {
        const { selectedCollectionIds, selectedFolderIds } = get();
        set({ loading: true }, false, 'getAllStories:start');
        try {
          const stories = await getAllStoriesFromCollection(
            collection,
            returnProperties,
            limit,
            offset,
            selectedCollectionIds,
            selectedFolderIds,
          );
          let hasNextStoriesPage = false;
          if ((stories?.objects?.length ?? 0) === limit) {
            const nextPageProbe = await getAllStoriesFromCollection(
              collection,
              returnProperties,
              1,
              offset + limit,
              selectedCollectionIds,
              selectedFolderIds,
            );
            hasNextStoriesPage = (nextPageProbe?.objects?.length ?? 0) > 0;
          }

          set({ stories: stories, hasNextStoriesPage, loading: false }, false, 'getAllStories:success');
        } catch {
          set({ hasNextStoriesPage: false, loading: false }, false, 'getAllStories:error');
        }
      },

      getStoryByUuid: async (uuid: string) => {
        set({ loading: true }, false, 'getStoryByGetStoryByUuid:start');
        try {
          const response = await getStoryByUuid(uuid);
          set({ story: response, loading: false }, false, 'getStoryByUuid:success');
        } catch (error) {
          console.error('Error fetching story by UUID', error);
          set({ loading: false }, false, 'getStoryByUuid:error');
        }
      },

      getStoryTranscriptByUuid: async (uuid: string) => {
        set({ loading: true }, false, 'getStoryTranscriptByUuid:start');

        try {
          const response = await fetchStoryTranscriptByUuid(uuid);
          const transcriptionJson = response?.properties.transcription;

          let parsedTranscript: Transcription | null = null;

          if (transcriptionJson) {
            parsedTranscript = JSON.parse(transcriptionJson);
          } else {
            parsedTranscript = null;
          }

          const allWords: Word[] = [];

          parsedTranscript?.sections?.forEach((section, sectionIdx) => {
            section.paragraphs?.forEach((paragraph, paraIdx) => {
              paragraph.words?.forEach((word, wordIdx) => {
                allWords.push({
                  text: word.text || '',
                  word_idx: wordIdx,
                  para_idx: paraIdx,
                  section_idx: sectionIdx,
                  start: word.start,
                  end: word.end,
                });
              });
            });
          });

          set(
            {
              allWords: allWords,
              transcript: parsedTranscript,
              loading: false,
              storyHubPage: response,
              selected_ner_labels: [],
            },
            false,
            'getStoryTranscriptByUuid:success',
          );
        } catch (error) {
          console.error('Error fetching story transcript by UUID:', error);
          set({ loading: false }, false, 'getStoryTranscriptByUuid:error');
        }
      },

      setUpdateSelectedNerLabel: (label: NerLabel) => {
        const { selected_ner_labels } = get();
        const updatedLabels = selected_ner_labels.includes(label)
          ? selected_ner_labels.filter((l) => l !== label)
          : [...selected_ner_labels, label];
        set({ selected_ner_labels: updatedLabels }, false, 'setUpdateSelectedNerLabel');
      },

      setSelectedNerLabels: (labels: NerLabel[]) => {
        set({ selected_ner_labels: labels }, false, 'setSelectedNerLabels');
      },

      runVectorSearch: async (
        collection: SchemaTypes,
        limit: number,
        offset = 0,
        filter: string[],
        returnProperties?: QueryProperty<SchemaMap[SchemaTypes]>[],
        minValue?: number,
        maxValue?: number,
      ) => {
        const { searchTerm, selectedCollectionIds, selectedFolderIds } = get();
        if (!searchTerm) {
          return;
        }
        set({ loading: true }, false, 'runVectorSearch:start');
        const response = await vectorSearch(
          collection,
          searchTerm,
          limit,
          offset,
          filter,
          selectedCollectionIds,
          selectedFolderIds,
          returnProperties,
          minValue,
          maxValue,
        );
        set({ result: response, loading: false }, false, 'runVectorSearch:success');
      },

      runHybridSearch: async (
        collection: SchemaTypes,
        limit: number,
        offset = 0,
        filter: string[],
        returnProperties?: QueryProperty<SchemaMap[SchemaTypes]>[],
        minValue?: number,
        maxValue?: number,
      ) => {
        const { searchTerm, selectedCollectionIds, selectedFolderIds } = get();
        if (!searchTerm) {
          return;
        }
        set({ loading: true }, false, 'runHybridSearch:start');
        const response = await hybridSearch(
          collection,
          searchTerm,
          limit,
          offset,
          filter,
          selectedCollectionIds,
          selectedFolderIds,
          returnProperties,
          minValue,
          maxValue,
        );

        set({ result: response, loading: false }, false, 'runHybridSearch:success');
      },

      run25bmSearch: async (
        collection: SchemaTypes,
        limit: number,
        offset = 0,
        filter: string[],
        returnProperties?: QueryProperty<SchemaMap[SchemaTypes]>[],
        minValue?: number,
        maxValue?: number,
      ) => {
        const { searchTerm, selectedCollectionIds, selectedFolderIds } = get();
        if (!searchTerm) {
          return;
        }
        set({ loading: true }, false, 'run25bmSearch:start');
        const response = await bm25Search(
          collection,
          searchTerm,
          limit,
          offset,
          filter,
          selectedCollectionIds,
          selectedFolderIds,
          returnProperties,
          minValue,
          maxValue,
        );
        set({ result: response, loading: false }, false, 'run25bmSearch:success');
      },

      runHybridSearchForStoryId: async (
        collection: SchemaTypes,
        limit: number,
        nerFilters?: string[],
        minValue?: number,
        maxValue?: number,
      ) => {
        const { searchTerm, storyHubPage } = get();
        const theirStoryId = storyHubPage?.uuid || '';
        console.log('Running hybrid search for story ID:', theirStoryId, 'with search term:', searchTerm);
        if (!searchTerm || !theirStoryId) {
          return;
        }

        set({ isSemanticSearching: true }, false, 'runHybridSearch:start');

        try {
          const response = await hybridSearchForStoryId(
            collection,
            theirStoryId,
            searchTerm,
            limit,
            nerFilters,
            minValue,
            maxValue,
          );

          const matches = response as WeaviateReturn<Chunks, any>;
          const uniqueMatches = matches.objects.filter(
            (obj, index, self) =>
              index === self.findIndex((t) => t.properties.start_time === obj.properties.start_time),
          );

          set(
            {
              result: response,
              matches: uniqueMatches,
              currentMatchIndex: uniqueMatches.length > 0 ? 0 : -1,
              isSemanticSearching: false,
            },
            false,
            'runHybridSearch:success',
          );
        } catch (error) {
          console.error('Hybrid search error:', error);
          set({ result: null, matches: [], isSemanticSearching: false }, false, 'runHybridSearch:error');
        }
      },

      runVectorSearchForStoryId: async (
        collection: SchemaTypes,
        limit: number,
        nerFilters?: string[],
        minValue?: number,
        maxValue?: number,
      ) => {
        const { searchTerm, storyHubPage } = get();
        const theirStoryId = storyHubPage?.uuid || '';

        if (!searchTerm || !theirStoryId) {
          return;
        }

        set({ isSemanticSearching: true }, false, 'runVectorSearchForStoryId:start');

        console.log('Running vector search for story ID:', theirStoryId, 'with search term:', searchTerm);

        try {
          const response = await vectorSearchForStoryId(
            collection,
            theirStoryId,
            searchTerm,
            limit,
            nerFilters,
            minValue,
            maxValue,
          );
          const matches = response as WeaviateReturn<Chunks, any>;

          const uniqueMatches = matches.objects.filter(
            (obj, index, self) =>
              index === self.findIndex((t) => t.properties.start_time === obj.properties.start_time),
          );

          set(
            {
              result: response,
              matches: uniqueMatches,
              currentMatchIndex: uniqueMatches.length > 0 ? 0 : -1,
              isSemanticSearching: false,
            },
            false,
            'runVectorSearchForStoryId:success',
          );
        } catch (error) {
          console.error('VectorSearchForStoryId search error:', error);
          set({ result: null, matches: [], isSemanticSearching: false }, false, 'runVectorSearchForStoryId:error');
        }
      },

      run25bmSearchForStoryId: async (
        collection: SchemaTypes,
        limit: number,
        nerFilters?: string[],
        minValue?: number,
        maxValue?: number,
      ) => {
        const { searchTerm, storyHubPage } = get();
        const theirStoryId = storyHubPage?.uuid || '';

        if (!searchTerm || !theirStoryId) {
          return;
        }

        set({ isSemanticSearching: true }, false, 'runVectorSearchForStoryId:start');

        try {
          const response = await bm25SearchForStoryId(
            collection,
            theirStoryId,
            searchTerm,
            limit,
            nerFilters,
            minValue,
            maxValue,
          );

          const matches = response as WeaviateReturn<Chunks, any>;

          const uniqueMatches = matches.objects.filter(
            (obj, index, self) =>
              index === self.findIndex((t) => t.properties.start_time === obj.properties.start_time),
          );

          set(
            {
              result: response,
              matches: uniqueMatches,
              currentMatchIndex: uniqueMatches.length > 0 ? 0 : -1,
              isSemanticSearching: false,
            },
            false,
            'runBm25SearchForStoryId:success',
          );
        } catch (error) {
          console.error('runBm25SearchForStoryId search error:', error);
          set({ result: null, matches: [], isSemanticSearching: false }, false, 'runBm25SearchForStoryId:error');
        }
      },

      setIsSemanticSearching: (isSearching: boolean) =>
        set({ isSemanticSearching: isSearching }, false, 'setIsSemanticSearching'),

      clearSearch: () =>
        set(
          {
            searchTerm: '',
            result: null,
            matches: [],
            isSemanticSearching: false,
            currentMatchIndex: -1,
          },
          false,
          'clearSearch',
        ),

      isSemanticSearching: false,

      nextMatch: () => {
        const { matches, currentMatchIndex } = get();
        if (matches.length > 0) {
          const nextIndex = (currentMatchIndex + 1) % matches.length;
          set({ currentMatchIndex: nextIndex }, false, 'nextMatch');
        }
      },

      previousMatch: () => {
        const { matches, currentMatchIndex } = get();
        if (matches.length > 0) {
          const prevIndex = currentMatchIndex === 0 ? matches.length - 1 : currentMatchIndex - 1;
          set({ currentMatchIndex: prevIndex }, false, 'previousMatch');
        }
      },

      setIsSearching: (isSearching: boolean) => set({ isSemanticSearching: isSearching }, false, 'setIsSearching'),

      setLoadingSearch: (loading: boolean) => set({ loadingSearch: loading }, false, 'setLoadingSearch'),

      setCurrentPage: (page) => set({ currentPage: page }, false, 'setCurrentPage'),

      setNerFilters: (filters) => set({ nerFilters: filters }, false, 'setNerFilters'),

      clearStore: () =>
        set(
          {
            searchTerm: '',
            loading: false,
            stories: null,
            story: null,
            storyHubPage: null,
            transcript: null,
            isSemanticSearching: false,
            loadingSearch: false,
            selected_ner_labels: [],
            matches: [],
            currentMatchIndex: -1,
            result: null,
            currentPage: 1,
            hasNextStoriesPage: false,
            nerFilters: [],
            collections: [],
            folders: [],
            selectedCollectionIds: [],
            selectedFolderIds: [],
            searchType: SearchType.bm25,
          },
          false,
          'clearStore',
        ),
    }),
    {
      name: 'Semantic Search Store',
    },
  ),
);
