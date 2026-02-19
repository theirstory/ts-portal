'use client';

import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor } from '@/config/organizationConfig';
import { getTimeRange } from '@/app/utils/util';
import { Chunks } from '@/types/weaviate';
import { Box, Typography, Paper, Link, Chip } from '@mui/material';
import React from 'react';
import { colors } from '@/lib/theme';
import { WeaviateGenericObject } from 'weaviate-client';
import { VideoThumbnail } from './VideoThumbnail';

interface Props {
  result: WeaviateGenericObject<Chunks>;
  index: number;
  isMobile?: boolean;
}

export const SearchTableRow: React.FC<Props> = ({ result, isMobile = false, index }) => {
  const { nerFilters, searchTerm } = useSemanticSearchStore();

  const {
    interview_title,
    start_time,
    end_time,
    speaker,
    transcription,
    theirstory_id,
    section_title,
    ner_labels,
    ner_text,
  } = result.properties;

  const highlightMatches = (text: string, term: string) => {
    if (!term.trim() || !text) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.split(regex).map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <Box
          key={i}
          component="span"
          sx={{
            backgroundColor: colors.warning.main,
            fontWeight: 'bold',
            padding: '2px 4px',
            borderRadius: '3px',
          }}>
          {part}
        </Box>
      ) : (
        part
      ),
    );
  };

  const highlightNERText = (text: string, searchTerm: string) => {
    if (!text || !ner_text || !ner_labels) return highlightMatches(text, searchTerm);

    let result: (string | React.ReactElement)[] = [text];

    ner_text.forEach((nerText: string, index: number) => {
      if (!nerText.trim()) return;

      const label = ner_labels[index];

      if (!nerFilters.includes(label)) return;

      const color = getNerColor(label);

      const nerRegex = new RegExp(`\\b(${nerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');

      result = result.flatMap((part, partIndex) => {
        if (typeof part === 'string') {
          const matches = [...part.matchAll(nerRegex)];
          if (matches.length === 0) return part;

          let lastIndex = 0;
          const segments: (string | React.ReactElement)[] = [];

          matches.forEach((match, matchIndex) => {
            if (match.index! > lastIndex) {
              segments.push(part.slice(lastIndex, match.index));
            }

            const fullMatch = match[0];
            const isSearchMatch =
              searchTerm.trim().length > 0 && fullMatch.toLowerCase().includes(searchTerm.toLowerCase());

            segments.push(
              <Box
                key={`ner-${partIndex}-${index}-${matchIndex}`}
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: color,
                  borderRadius: '4px',
                  padding: '2px 4px',
                  margin: '0 2px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: colors.text.primary,
                  textDecoration: isSearchMatch ? 'underline' : 'none',
                  textDecorationColor: isSearchMatch ? colors.primary.main : undefined,
                  textDecorationThickness: isSearchMatch ? '2px' : undefined,
                }}>
                {fullMatch}
                <Box
                  component="span"
                  sx={{
                    marginLeft: '6px',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: colors.text.secondary,
                  }}>
                  {label.replace(/_/g, ' ').toUpperCase()}
                </Box>
              </Box>,
            );

            lastIndex = match.index! + fullMatch.length;
          });

          if (lastIndex < part.length) {
            segments.push(part.slice(lastIndex));
          }

          return segments;
        }
        return part;
      });
    });

    if (searchTerm.trim()) {
      const searchRegex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

      result = result.flatMap((part, partIndex) => {
        if (typeof part === 'string') {
          return part.split(searchRegex).map((subPart, subIndex) =>
            subPart.toLowerCase() === searchTerm.toLowerCase() ? (
              <Box
                key={`search-${partIndex}-${subIndex}`}
                component="span"
                sx={{
                  backgroundColor: colors.warning.main,
                  fontWeight: 'bold',
                  padding: '2px 4px',
                  borderRadius: '3px',
                }}>
                {subPart}
              </Box>
            ) : (
              subPart
            ),
          );
        }
        return part;
      });
    }

    return result.map((part, index) => <span key={index}>{part}</span>);
  };

  // Build URL with NER filters if they exist
  const buildStoryUrl = () => {
    const params = new URLSearchParams();
    params.set('start', start_time.toString());
    params.set('end', end_time.toString());
    if (nerFilters && nerFilters.length > 0) {
      params.set('nerFilters', nerFilters.join(','));
    }

    return `/story/${theirstory_id}?${params.toString()}`;
  };

  const handleClick = () => {
    window.open(buildStoryUrl(), '_blank');
  };

  // Mobile Card Layout
  if (isMobile) {
    return (
      <Paper
        id={`mobile-card-${result.uuid}-${index}`}
        sx={{
          p: 2,
          mb: 2,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: colors.grey[100],
            boxShadow: 2,
          },
        }}
        onClick={handleClick}>
        {/* Header with thumbnail and basic info */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'flex-start' }}>
          {/* Thumbnail */}
          <VideoThumbnail
            story={result}
            fontSize={10}
            audioFileSize={{ width: '40', height: '25' }}
            startTime={start_time}
          />
        </Box>

        {/* Title and basic info */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{
              fontSize: '1.1rem',
              lineHeight: 1.3,
              mb: 1,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: colors.text.primary,
            }}>
            {interview_title || 'Untitled Interview'}
          </Typography>

          {/* Section */}
          {section_title && (
            <Box sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.25,
                  fontSize: '0.68rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: colors.text.secondary,
                  fontWeight: 700,
                }}>
                Section
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: colors.text.primary,
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                {section_title}
              </Typography>
            </Box>
          )}

          {(speaker || (start_time && end_time)) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.1, minWidth: 0 }}>
              {speaker && (
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.8rem',
                    color: colors.text.secondary,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                  {speaker}
                </Typography>
              )}
              {speaker && start_time && end_time && (
                <Typography
                  component="span"
                  sx={{
                    color: colors.text.secondary,
                    fontSize: '0.75rem',
                    lineHeight: 1,
                  }}>
                  •
                </Typography>
              )}
              {start_time && end_time && (
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.8rem',
                    color: colors.text.secondary,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                  {getTimeRange(start_time, end_time)}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Excerpt */}
        {transcription && (
          <Box sx={{ pt: 1.1, borderTop: `1px solid ${colors.grey[300]}` }}>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mb: 0.55,
                fontSize: '0.66rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.text.secondary,
                fontWeight: 700,
              }}>
              Excerpt
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.55,
                fontSize: '0.875rem',
                color: colors.text.secondary,
              }}>
              {highlightNERText(transcription, searchTerm)}
            </Typography>
          </Box>
        )}
      </Paper>
    );
  }

  // Desktop Table Row Layout
  return (
    <Link
      key={`list-${result.uuid}-${index}`}
      href={buildStoryUrl()}
      style={{ textDecoration: 'none', cursor: 'pointer' }}
      target="_blank">
      <Box
        id={`desktop-row-${result.uuid}-${index}`}
        sx={{
          display: 'grid',
          gridTemplateColumns: '120px 200px 200px 1fr 150px',
          gap: 2,
          p: 2,
          alignItems: 'start',
          bgcolor: colors.common.white,
          borderRadius: 1,
          border: `1px solid ${colors.grey[300]}`,
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: colors.grey[100],
            borderColor: colors.primary.main,
            boxShadow: 1,
          },
        }}>
        {/* Thumbnail */}
        <VideoThumbnail
          story={result}
          fontSize={10}
          audioFileSize={{ width: '80', height: '50' }}
          startTime={start_time}
        />

        {/* Recording Title */}
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            sx={{
              fontSize: '1rem',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: colors.text.primary,
            }}>
            {interview_title ?? 'Untitled Interview'}
          </Typography>
        </Box>

        {/* Section */}
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            sx={{
              fontSize: '1rem',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: colors.text.primary,
            }}>
            {section_title ?? 'Untitled Section'}
          </Typography>
        </Box>

        {/* Excerpt */}
        <Box sx={{ minWidth: 0 }}>
          {start_time && end_time && (
            <Box sx={{ mb: 1 }}>
              <Chip
                label={`Time: ${getTimeRange(start_time, end_time)}`}
                size="small"
                color="default"
                sx={{ bgcolor: colors.grey[200], color: colors.text.secondary, fontWeight: 500 }}
              />
            </Box>
          )}
          {transcription ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                lineHeight: 1.6,
                fontSize: '0.775rem',
                cursor: 'pointer',
              }}>
              {highlightNERText(transcription, searchTerm)}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.875rem' }}>
              No description available
            </Typography>
          )}
        </Box>

        {/* Speaker */}
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              lineHeight: 1.3,
              fontSize: '0.875rem',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: colors.text.primary,
            }}>
            {speaker ?? 'Untitled Speaker'}
          </Typography>
        </Box>
      </Box>
    </Link>
  );
};
