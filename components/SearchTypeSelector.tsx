'use client';

import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SearchType } from '@/types/searchType';
import { Box, MenuItem, Select } from '@mui/material';

const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  [SearchType.bm25]: 'Keyword',
  [SearchType.Vector]: 'Thematic',
  [SearchType.Hybrid]: 'Hybrid',
};

const SEARCH_TYPE_FULL_LABELS: Record<SearchType, string> = {
  [SearchType.bm25]: 'Keyword Search',
  [SearchType.Vector]: 'Thematic Search',
  [SearchType.Hybrid]: 'Hybrid Search',
};

export const SearchTypeSelector = ({ compact = false }: { compact?: boolean }) => {
  const { searchType, setSearchType } = useSemanticSearchStore();

  const handleSearchTypeChange = (newType: SearchType) => {
    setSearchType(newType);
  };

  return (
    <Box width={compact ? '100%' : '160px'}>
      <Select
        size="small"
        value={searchType}
        onChange={(e) => handleSearchTypeChange(e.target.value as SearchType)}
        renderValue={(value) =>
          compact ? SEARCH_TYPE_LABELS[value as SearchType] : SEARCH_TYPE_FULL_LABELS[value as SearchType]
        }
        sx={{
          width: '100%',
          fontSize: compact ? 13 : 14,
          padding: 0,
          backgroundColor: 'transparent',
          '& .MuiSelect-select': {
            px: compact ? 1 : 1.5,
            py: compact ? 0.75 : 1,
          },
          '& fieldset': { border: 'none' },
        }}
        inputProps={{ 'aria-label': 'Search Type' }}>
        <MenuItem value={SearchType.bm25}>Keyword Search</MenuItem>
        <MenuItem value={SearchType.Vector}>Thematic Search</MenuItem>
        <MenuItem value={SearchType.Hybrid}>Hybrid Search</MenuItem>
      </Select>
    </Box>
  );
};
