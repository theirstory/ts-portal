'use client';

import { useEffect } from 'react';
import { Box } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { CollectionsSection } from '@/components/CollectionsSection';

export default function CollectionsRoutePage() {
  const { loadCollections } = useSemanticSearchStore();

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  return (
    <Box sx={{ height: '100vh' }} id="collections-layout-container">
      <Box
        sx={{
          display: 'flex',
          maxWidth: '1600px',
          mx: 'auto',
          paddingX: { xs: 2, sm: 3, md: 4 },
          paddingTop: { xs: 1, md: 2 },
        }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CollectionsSection />
        </Box>
      </Box>
    </Box>
  );
}
