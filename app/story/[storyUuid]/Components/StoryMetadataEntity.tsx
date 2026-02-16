import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';

import { Box, Chip, Typography, Tooltip, useMediaQuery } from '@mui/material';
import React, { useMemo, useState } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { getNerColor } from '@/config/organizationConfig';
import { groupBy } from 'lodash';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { useTranscriptPanelStore } from '@/app/stores/useTranscriptPanelStore';
import { NerEntityModal } from './NerEntityModal';
import { colors, theme } from '@/lib/theme';

export const StoryMetadataEntity = () => {
  /**
   * hooks
   */
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));

  /**
   * store
   */
  const { storyHubPage, selected_ner_labels, setUpdateSelectedNerLabel } = useSemanticSearchStore();
  const { seekTo, currentTime } = usePlayerStore();
  const { setTargetScrollTime } = useTranscriptPanelStore();

  /**
   * state
   */
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{
    text: string;
    label: string;
  } | null>(null);

  /**
   * handlers
   */
  const handleOpenModal = (text: string, label: string) => {
    setSelectedEntity({ text, label });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedEntity(null);
  };

  const handleCategoryClick = (category: string) => {
    // Toggle the NER label on if it's not already selected
    if (!selected_ner_labels.includes(category as any)) {
      setUpdateSelectedNerLabel(category as any);
    }

    // Find all instances of this category/label
    const categoryInstances = (ner_data || [])
      .filter((item: any) => item.label === category)
      .sort((a: any, b: any) => a.start_time - b.start_time);

    if (categoryInstances.length === 0) return;

    // Deduplicate instances that are very close together (within 0.001 seconds)
    const deduplicatedInstances = categoryInstances.filter(
      (instance: any, index: number, arr: any[]) =>
        index === 0 || Math.abs(instance.start_time - arr[index - 1].start_time) > 0.001,
    );

    // Find the next instance after current time
    const nextInstance = deduplicatedInstances.find((item: any) => item.start_time > currentTime);

    // If no next instance, wrap around to the first one
    const targetInstance = nextInstance || deduplicatedInstances[0];

    if (targetInstance) {
      seekTo(targetInstance.start_time);
      setTargetScrollTime(targetInstance.start_time);
    }
  };

  /**
   * variables
   */
  const { ner_data } = storyHubPage?.properties || {};

  const groupedEntities = useMemo(() => {
    const grouped = groupBy(ner_data, 'label');

    return Object.fromEntries(
      Object.entries(grouped).map(([label, entries]) => {
        const textMap = new Map<string, { count: number; start_times: number[] }>();

        for (const { text, start_time } of entries) {
          if (textMap.has(text)) {
            const existing = textMap.get(text)!;
            existing.start_times.push(start_time);
          } else {
            textMap.set(text, { count: 1, start_times: [start_time] });
          }
        }

        const uniqueItems = Array.from(textMap.entries())
          .map(([text, data]) => {
            const sortedTimes = data.start_times.sort((a, b) => a - b);
            const uniqueTimes = sortedTimes.filter(
              (time, index, arr) => index === 0 || Math.abs(time - arr[index - 1]) > 0.001,
            );

            return {
              text,
              count: uniqueTimes.length,
              start_times: uniqueTimes,
            };
          })
          .sort((a, b) => a.text.localeCompare(b.text));

        return [label, uniqueItems];
      }),
    );
  }, [ner_data]);

  /**
   * render
   */
  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {Object.entries(groupedEntities).map(([category, items]) => (
        <Box
          key={category}
          id="ner-category-container"
          sx={{ backgroundColor: colors.background.paper, borderRadius: 2, p: 1 }}>
          <Tooltip title={`Click to navigate to next ${category} instance`} arrow>
            <Box
              display="flex"
              alignItems="center"
              mb={0.5}
              gap={1}
              sx={{
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '8px',
                transition: 'background-color 0.2s ease',
                '&:hover': {
                  backgroundColor: colors.grey[100],
                },
              }}
              onClick={() => handleCategoryClick(category)}>
              <AutoAwesomeIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" fontWeight="bold" color="info">
                {category}
              </Typography>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: getNerColor(category),
                }}
              />
              {!isMobile && <NavigateNextIcon fontSize="small" sx={{ opacity: 0.6, ml: 0.5 }} />}
            </Box>
          </Tooltip>
          <Box
            display="flex"
            flexWrap="wrap"
            gap={0.5}
            maxHeight="200px"
            overflow="auto"
            p={1}
            sx={{ borderRadius: 1 }}>
            {items.map(({ text, count }, index) => (
              <Chip
                id="ner-entity-chip"
                key={index}
                variant="outlined"
                label={`${text} (${count})`}
                onClick={() => handleOpenModal(text, category)}
                clickable
                size="small"
                sx={{ fontSize: '0.75rem', height: 22, minHeight: 22 }}
              />
            ))}
          </Box>
        </Box>
      ))}
      {selectedEntity && (
        <NerEntityModal
          open={modalOpen}
          onClose={handleCloseModal}
          entityText={selectedEntity.text}
          entityLabel={selectedEntity.label}
          currentStoryUuid={(storyHubPage?.properties as any)?.theirstory_id}
        />
      )}
    </Box>
  );
};
