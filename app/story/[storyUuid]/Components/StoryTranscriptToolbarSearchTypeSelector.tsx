'use client';

import { useSearchStore } from '@/app/stores/useSearchStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { theme } from '@/lib/theme';
import { SearchType } from '@/types/searchType';
import { FormControl, MenuItem, Select, useMediaQuery } from '@mui/material';

export const SearchTypeSelector = () => {
  const { searchType, setSearchType, clearSearch } = useSemanticSearchStore();
  const { clearSearch: clearTraditionalSearch } = useSearchStore();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));

  const handleSearchTypeChange = (newType: SearchType) => {
    setSearchType(newType);
    clearSearch();
    clearTraditionalSearch();
  };

  return (
    <FormControl size="small" sx={{ minWidth: isMobile ? 100 : 150 }}>
      <Select
        size="small"
        value={
          // We use traditional search in story transcript instead of bm25
          searchType === SearchType.bm25 ? SearchType.traditional : searchType
        }
        onChange={(e) => handleSearchTypeChange(e.target.value as SearchType)}
        variant="standard"
        disableUnderline
        sx={{
          fontSize: isMobile ? 12 : 14,
          padding: 0,
          textAlign: isMobile ? 'right' : 'left',
          backgroundColor: 'transparent',
          '& .MuiSelect-select': {
            padding: '6px 8px',
          },
          '& fieldset': { border: 'none' },
        }}
        inputProps={{ 'aria-label': 'Search Type' }}>
        <MenuItem value={SearchType.traditional}>{isMobile ? 'Keyword' : 'Keyword Search'}</MenuItem>
        <MenuItem value={SearchType.Vector}>{isMobile ? 'Thematic' : 'Thematic Search'}</MenuItem>
        <MenuItem value={SearchType.Hybrid}>{isMobile ? 'Hybrid' : 'Hybrid Search'}</MenuItem>
      </Select>
    </FormControl>
  );
};
