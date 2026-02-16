'use client';

import { Box, Typography, Divider, Tabs, Tab } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { StoryMetadataEntity } from './StoryMetadataEntity';
import { useState } from 'react';
import { colors } from '@/lib/theme';

interface StoryMetadataProps {
  isMobile?: boolean;
}

export const StoryMetadata = ({ isMobile = false }: StoryMetadataProps) => {
  const { storyHubPage } = useSemanticSearchStore();
  const [tabValue, setTabValue] = useState(0);

  const { interview_title, interview_description, recording_date, publisher, participants } =
    storyHubPage?.properties || {};

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Mobile version - just metadata content without tabs (tabs are in parent)
  if (isMobile) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        padding="12px"
        sx={{
          borderRadius: 2,
          bgcolor: colors.background.default,
        }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}>
          {interview_title && (
            <Typography variant="subtitle1" fontWeight="bold" color="primary" sx={{ lineHeight: 1.3 }}>
              {interview_title}
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary">
            {recording_date ?? 'No date available'} - {publisher ?? ''}
          </Typography>

          <Divider sx={{ my: 1 }} />

          <Box>
            <Typography
              variant="caption"
              fontWeight="bold"
              gutterBottom
              color="primary"
              sx={{ display: 'block', mb: 0.5 }}>
              Participants
            </Typography>
            {participants && !!participants.length && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                {Array.from(new Set(participants)).join(', ')}
              </Typography>
            )}
          </Box>
          <Box>
            <Typography
              variant="caption"
              fontWeight="bold"
              gutterBottom
              color="primary"
              sx={{ display: 'block', mb: 0.5 }}>
              Summary
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
              {interview_description?.trim() ? interview_description : 'No summary available'}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  // Desktop version with tabs
  return (
    <Box
      display="flex"
      flexDirection="column"
      sx={{
        height: 'calc(100dvh - 422px)',
        overflowY: 'auto',
        borderRadius: 2,
        bgcolor: colors.background.default,
        overflow: 'hidden',
      }}>
      {/* Tabs Header */}
      <Box>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="metadata tabs"
          sx={{
            paddingLeft: 2,
            '& .MuiTabs-indicator': {
              backgroundColor: 'primary.main',
            },
          }}>
          <Tab label="Metadata" sx={{ textTransform: 'none' }} />
          <Tab label="Entities" sx={{ textTransform: 'none' }} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {/* Metadata Tab */}
        {tabValue === 0 && (
          <Box
            sx={{
              px: 3,
              pb: 3,
              pt: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}>
            {interview_title && (
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight="bold" color="primary">
                  {interview_title}
                </Typography>
              </Box>
            )}

            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 0.5 }}>
              {recording_date ?? 'No date available'} - {publisher ?? ''}
            </Typography>

            <Divider sx={{ my: 2 }} />

            <Box>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                Participants
              </Typography>
              {participants && !!participants.length && (
                <Typography variant="body2" color="text.secondary">
                  {Array.from(new Set(participants)).join(', ')}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom color="primary">
                Summary
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {interview_description?.trim() ? interview_description : 'No summary available'}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Entities Tab */}
        {tabValue === 1 && (
          <Box sx={{ px: 3, pb: 3, pt: 1, height: '100%' }}>
            <StoryMetadataEntity />
          </Box>
        )}
      </Box>
    </Box>
  );
};
