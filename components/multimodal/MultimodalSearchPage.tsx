'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { colors } from '@/lib/theme';
import useLayoutState from '@/app/stores/useLayout';
import { ALL_SOURCE_TYPES, useMultimodalSearchStore } from '@/app/stores/useMultimodalSearchStore';
import type { SearchMode, SourceType } from '@/lib/weaviate/multimodalSearch';
import { MultimodalResultCard } from './MultimodalResultCard';
import { ExhibitDetailDrawer } from './ExhibitDetailDrawer';

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  recording: 'Recordings',
  document: 'Documents',
  image: 'Images',
};

const EXAMPLE_QUERIES = [
  'a photograph of a pharmaceutical production line',
  'red flag prescriptions dispensed by pharmacies',
  'babies born dependent on opioids',
  'sales representatives discussing prescriber targets',
];

export function MultimodalSearchPage() {
  const {
    query,
    results,
    perTypeCounts,
    activeSourceTypes,
    loading,
    hasSearched,
    browsing,
    error,
    selectedResult,
    showScores,
    mode,
    setQuery,
    setMode,
    toggleSourceType,
    setSelectedResult,
    toggleShowScores,
    search,
    browse,
    clear,
  } = useMultimodalSearchStore();

  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const urlOpen = searchParams.get('open') ?? '';
  const urlMode = searchParams.get('mode') === 'keyword' ? 'keyword' : 'semantic';

  const { setTopBarCollapsedAuto } = useLayoutState();
  const [submittedQuery, setSubmittedQuery] = React.useState('');

  // A shared link should reproduce the same result set, which means carrying the retrieval
  // mode as well as the query — the two produce very different answers.
  const buildUrl = React.useCallback((term: string, nextMode: SearchMode, openUuid?: string) => {
    const params = new URLSearchParams({ q: term });
    if (nextMode !== 'semantic') params.set('mode', nextMode);
    if (openUuid) params.set('open', openUuid);
    return `/search?${params.toString()}`;
  }, []);

  const runSearch = React.useCallback(
    (term?: string, nextMode?: SearchMode) => {
      const next = (term ?? query).trim();
      if (!next) return;

      setSubmittedQuery(next);
      // Reclaim the hero for results: on a search the answer is the point, not the banner.
      setTopBarCollapsedAuto(true);
      router.replace(buildUrl(next, nextMode ?? mode), { scroll: false });
      void search();
    },
    [buildUrl, mode, query, router, search, setTopBarCollapsedAuto],
  );

  // Open on the collection rather than an empty box, and run whatever a shared link asks for.
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (!urlQuery) {
      void browse();
      return;
    }

    setQuery(urlQuery);
    setSubmittedQuery(urlQuery);
    setTopBarCollapsedAuto(true);
    if (urlMode !== 'semantic') setMode(urlMode);
    void search();
  }, [urlQuery, urlMode, setQuery, setMode, search, browse, setTopBarCollapsedAuto]);

  React.useEffect(() => {
    if (!urlOpen || selectedResult?.uuid === urlOpen) return;
    const match = results.find((result) => result.uuid === urlOpen);
    if (match) setSelectedResult(match);
  }, [urlOpen, results, selectedResult, setSelectedResult]);

  const resultsByType = React.useMemo(
    () =>
      results.reduce<Record<SourceType, number>>(
        (acc, result) => {
          acc[result.sourceType] += 1;
          return acc;
        },
        { recording: 0, document: 0, image: 0 },
      ),
    [results],
  );

  // Relevance bars are scaled against the best hit in the set, so they mean "how close to
  // the top result" rather than exposing an absolute cosine no reader can calibrate.
  const topScore = React.useMemo(
    () => results.reduce((max, result) => Math.max(max, result.score), 0),
    [results],
  );

  const showingResults = !loading && !error && results.length > 0;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          maxWidth: '1600px',
          width: '100%',
          mx: 'auto',
          px: { xs: 2, sm: 3, md: 4 },
          py: { xs: 1.5, md: 2 },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: 1,
        }}>
        {/* Controls in one compact row, so results start as high up the page as possible. */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
          <TextField
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runSearch();
            }}
            placeholder="Search recordings, documents, and images by meaning or by exact words…"
            sx={{ flex: 1, minWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => {
                      clear();
                      setSubmittedQuery('');
                      router.replace('/search', { scroll: false });
                    }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          <Tooltip
            title={
              mode === 'semantic'
                ? 'Semantic: finds material that means the same thing in different words, including photographs with no text at all.'
                : 'Keyword: finds these exact terms and nothing else. Better for a name, a drug, or an acronym like DEA.'
            }>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode}
              onChange={(_event, next: SearchMode | null) => {
                if (!next) return;
                setMode(next);
                if (submittedQuery) router.replace(buildUrl(submittedQuery, next), { scroll: false });
              }}>
              <ToggleButton value="semantic" sx={{ textTransform: 'none', px: 1.5 }}>
                Semantic
              </ToggleButton>
              <ToggleButton value="keyword" sx={{ textTransform: 'none', px: 1.5 }}>
                Keyword
              </ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>

          <FormControlLabel
            sx={{ mr: 0 }}
            control={<Switch size="small" checked={showScores} onChange={toggleShowScores} />}
            label={<Typography variant="caption">Scores</Typography>}
          />
        </Box>

        {/* Type filters, with live counts. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          {ALL_SOURCE_TYPES.map((sourceType) => {
            const active = activeSourceTypes.includes(sourceType);
            const count = results.length ? resultsByType[sourceType] : undefined;
            return (
              <Chip
                key={sourceType}
                size="small"
                label={
                  count === undefined
                    ? SOURCE_TYPE_LABELS[sourceType]
                    : `${SOURCE_TYPE_LABELS[sourceType]} ${count}`
                }
                onClick={() => toggleSourceType(sourceType)}
                variant={active ? 'filled' : 'outlined'}
                color={active ? 'primary' : 'default'}
              />
            );
          })}

          <Box sx={{ flex: 1 }} />

          {showingResults && (
            <Typography variant="caption" color="text.secondary">
              {browsing ? `Browsing ${results.length} items` : `${results.length} results`}
              {showScores && !browsing
                ? ` · candidates ${perTypeCounts.recording}/${perTypeCounts.document}/${perTypeCounts.image}`
                : ''}
            </Typography>
          )}
        </Box>

        {!hasSearched && !browsing && !loading && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Try one of these
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {EXAMPLE_QUERIES.map((example) => (
                <Chip
                  key={example}
                  size="small"
                  label={example}
                  variant="outlined"
                  onClick={() => {
                    setQuery(example);
                    runSearch(example);
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={36} />
          </Box>
        )}

        {showingResults && (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              pr: { xs: 0, md: 1 },
              pb: 2,
              // Two columns on a wide screen: these cards are short, and one narrow column
              // left most of the page empty.
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
              gap: 1,
              alignContent: 'start',
              '&::-webkit-scrollbar': { width: '8px' },
              '&::-webkit-scrollbar-track': { backgroundColor: colors.grey[100], borderRadius: '4px' },
              '&::-webkit-scrollbar-thumb': { backgroundColor: colors.grey[400], borderRadius: '4px' },
            }}>
            {results.map((result) => (
              <MultimodalResultCard
                key={result.uuid}
                result={result}
                showScores={showScores}
                topScore={topScore}
                onSelect={(selected) => {
                  // A transcript hit is only useful if it takes you to that moment, so
                  // recordings open the story page seeked to the chunk. Exhibits have no
                  // separate page, so they open in the detail drawer instead.
                  if (selected.sourceType === 'recording') {
                    if (!selected.storyId) return;
                    const params = new URLSearchParams();
                    params.set('start', String(selected.startTime ?? 0));
                    params.set('end', String(selected.endTime ?? 0));
                    window.open(`/story/${selected.storyId}?${params.toString()}`, '_blank');
                    return;
                  }

                  setSelectedResult(selected);
                  if (submittedQuery || query) {
                    router.replace(buildUrl(submittedQuery || query, mode, selected.uuid), { scroll: false });
                  }
                }}
              />
            ))}
          </Box>
        )}

        {!loading && !error && results.length === 0 && (hasSearched || browsing) && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {mode === 'keyword'
              ? 'No text contains these exact terms. Switch to Semantic to search by meaning, which also reaches photographs.'
              : 'Nothing matched. Try describing the material differently, or re-enable a source type.'}
          </Typography>
        )}
      </Box>

      <ExhibitDetailDrawer
        result={selectedResult}
        query={submittedQuery}
        onClose={() => {
          setSelectedResult(null);
          if (submittedQuery || query) {
            router.replace(buildUrl(submittedQuery || query, mode), { scroll: false });
          }
        }}
      />
    </Box>
  );
}
