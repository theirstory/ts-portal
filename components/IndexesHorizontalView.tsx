'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Link from 'next/link';
import { VideoThumbnail } from './VideoThumbnail';
import { durationFormatHandler, formatTime } from '@/app/utils/util';
import { colors } from '@/lib/theme';
import { highlightSearchText } from '@/app/indexes/highlightSearch';
import type { IndexesStory, IndexChapter } from '@/app/api/indexes/route';
import type { WeaviateGenericObject } from 'weaviate-client';
import type { Testimonies } from '@/types/weaviate';

function storyToThumbnailStory(story: IndexesStory): WeaviateGenericObject<Testimonies> {
  return {
    uuid: story.uuid,
    properties: {
      video_url: story.video_url,
      interview_title: story.interview_title,
      interview_duration: story.interview_duration,
      isAudioFile: story.isAudioFile,
      interview_description: story.interview_description,
      ner_labels: story.ner_labels,
      collection_id: story.collection_id,
      collection_name: story.collection_name,
      collection_description: story.collection_description,
      recording_date: '',
      transcoded: '',
      transcription: '',
      ner_data: null,
      participants: null,
      publisher: '',
      hasChunks: null,
    },
    metadata: {},
    references: {},
    vectors: {},
  } as WeaviateGenericObject<Testimonies>;
}

export function IndexesHorizontalView({
  stories,
  chaptersByStoryId,
  searchQuery = '',
}: {
  stories: IndexesStory[];
  chaptersByStoryId: Record<string, IndexChapter[]>;
  searchQuery?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        gap: 3,
        pb: 2,
        overflowX: 'auto',
        alignItems: 'stretch',
        minHeight: 320,
      }}>
      {stories.map((story) => {
        const chapters = chaptersByStoryId[story.uuid] ?? [];
        const storyForThumb = storyToThumbnailStory(story);
        return (
          <Box
            key={story.uuid}
            sx={{
              flex: '0 0 360px',
              minWidth: 360,
              maxWidth: 360,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              bgcolor: 'transparent',
            }}>
            <Link href={`/story/${story.uuid}`} style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5,
                  p: 1.5,
                  width: '100%',
                  boxSizing: 'border-box',
                }}>
                <Box sx={{ width: 80, flexShrink: 0 }}>
                  <VideoThumbnail
                    story={storyForThumb}
                    aspectRatio={16 / 9}
                    fontSize={8}
                    audioFileSize={{ width: '32', height: '18' }}
                  />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <Typography variant="subtitle2" fontWeight={600} component="span" sx={{ wordBreak: 'break-word' }}>
                    {highlightSearchText(story.interview_title, searchQuery)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {durationFormatHandler(story.interview_duration)} — {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Box>
            </Link>
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                p: 1,
                '&::-webkit-scrollbar': { width: 4 },
                '&::-webkit-scrollbar-thumb': { backgroundColor: colors.grey[400], borderRadius: 2 },
              }}>
              {chapters.map((ch) => (
                <Link
                  key={`${story.uuid}-${ch.section_id}`}
                  href={`/story/${story.uuid}?start=${ch.start_time}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Box
                    sx={{
                      py: 1,
                      px: 1.5,
                      mb: 1,
                      borderRadius: 1,
                      bgcolor: colors.background.paper,
                      border: `1px solid ${colors.common.border}`,
                      boxShadow: `0 1px 2px ${colors.common.shadow}`,
                      '&:hover': { bgcolor: colors.grey[50] },
                    }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {formatTime(ch.start_time)}
                    </Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ display: 'block', wordBreak: 'break-word' }} component="span">
                      {highlightSearchText(ch.section_title, searchQuery)}
                    </Typography>
                    {ch.synopsis && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                        sx={{
                          mt: 0.25,
                          lineHeight: 1.3,
                          display: 'block',
                        }}>
                        {highlightSearchText(ch.synopsis, searchQuery)}
                      </Typography>
                    )}
                  </Box>
                </Link>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
