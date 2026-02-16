import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { NerLabel } from '@/types/ner';
import { Testimonies } from '@/types/weaviate';
import { Box, Chip, Divider, Typography } from '@mui/material';
import React from 'react';
import { WeaviateGenericObject } from 'weaviate-client';
import { colors } from '@/lib/theme';

export const ListViewNerChips = ({ story }: { story: WeaviateGenericObject<Testimonies> }) => {
  const { nerFilters } = useSemanticSearchStore();
  const filteredNerLabels = story.properties.ner_labels.filter((label: NerLabel) => nerFilters.includes(label));

  console.log('Rendering NER Chips for story:', story.id, 'with labels:', filteredNerLabels);
  if (!filteredNerLabels.length) return null;
  return (
    <>
      <Divider orientation="horizontal" />
      <Box display="flex" gap={1} flexWrap="wrap">
        <Typography variant="body2" color="text.secondary" fontSize="0.875rem">
          NER Labels:
        </Typography>
        {story.properties.ner_labels.map((ner: NerLabel) => (
          <Chip
            key={ner}
            label={getNerDisplayName(ner)}
            size="small"
            sx={{
              backgroundColor: getNerColor(ner),
              color: colors.text.secondary,
              fontWeight: 500,
            }}
          />
        ))}
      </Box>
    </>
  );
};
