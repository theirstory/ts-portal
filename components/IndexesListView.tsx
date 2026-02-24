'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
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

export function IndexesListView({
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
        flexDirection: 'column',
        gap: 3,
        pb: 2,
        maxWidth: 860,
        width: '100%',
      }}>
      {stories.map((story, index) => {
        const chapters = chaptersByStoryId[story.uuid] ?? [];
        const storyForThumb = storyToThumbnailStory(story);
        return (
          <React.Fragment key={story.uuid}>
            {index > 0 && <Divider sx={{ my: 2 }} />}
            <Box sx={{ bgcolor: 'transparent' }}>
              <Link href={`/story/${story.uuid}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 2,
                    py: 1.5,
                    px: 0,
                    '&:hover': { bgcolor: 'transparent' },
                  }}>
                  <Box sx={{ width: 100, flexShrink: 0 }}>
                    <VideoThumbnail
                      story={storyForThumb}
                      aspectRatio={16 / 9}
                      fontSize={9}
                      audioFileSize={{ width: '36', height: '20' }}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }} component="span">
                      {highlightSearchText(story.interview_title, searchQuery)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {durationFormatHandler(story.interview_duration)} — {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                </Box>
              </Link>
              {chapters.length > 0 && (
              <Box
                sx={{
                  py: 0.5,
                  pl: 2.5,
                  borderLeft: `3px solid ${colors.grey[300]}`,
                  ml: 0.5,
                }}>
                {chapters.map((ch) => (
                  <Link
                    key={`${story.uuid}-${ch.section_id}`}
                    href={`/story/${story.uuid}?start=${ch.start_time}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Box
                      sx={{
                        py: 1.5,
                        px: 1.5,
                        mb: 1,
                        borderRadius: 1,
                        bgcolor: colors.background.paper,
                        border: `1px solid ${colors.common.border}`,
                        boxShadow: `0 1px 2px ${colors.common.shadow}`,
                        '&:hover': { bgcolor: colors.grey[50] },
                      }}>
                      <Typography variant="body2" color="text.secondary" component="span" sx={{ mr: 1 }}>
                        {formatTime(ch.start_time)}
                      </Typography>
                      <Typography variant="body2" component="span" fontWeight={500}>
                        {highlightSearchText(ch.section_title, searchQuery)}
                      </Typography>
                      {ch.synopsis && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          component="span"
                          sx={{
                            mt: 0.5,
                            fontSize: '0.8125rem',
                            lineHeight: 1.4,
                            display: 'block',
                          }}>
                          {highlightSearchText(ch.synopsis, searchQuery)}
                        </Typography>
                      )}
                    </Box>
                  </Link>
                ))}
              </Box>
            )}
            </Box>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
