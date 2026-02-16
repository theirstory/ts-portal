import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { Testimonies } from '@/types/weaviate';
import { Box, Paper, Tooltip, Typography } from '@mui/material';
import Link from 'next/link';
import { WeaviateReturn } from 'weaviate-client';
import { VideoThumbnail } from './VideoThumbnail';
import { NerLabel } from '@/types/ner';

export const GridView = () => {
  const { stories, nerFilters } = useSemanticSearchStore();
  const storiesTestimonies = stories as WeaviateReturn<Testimonies> | null;
  const storiesFilteredByNer = storiesTestimonies?.objects.filter((story) =>
    nerFilters.length > 0 ? story.properties.ner_labels.some((label: NerLabel) => nerFilters.includes(label)) : true,
  );

  return (
    <Box
      id="grid-view"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 3,
        pb: 2,
        pt: 1,
      }}>
      {storiesFilteredByNer?.map((story, index) => (
        <Link
          key={`grid-${story.uuid}-${index}`}
          href={`/story/${story.uuid}`}
          style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <Paper
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 1,
              transition: 'all 0.2s ease',
              '&:hover': {
                boxShadow: 3,
                transform: 'translateY(-2px)',
              },
            }}>
            {/* Thumbnail */}
            <VideoThumbnail
              story={story}
              aspectRatio={16 / 9}
              fontSize={12}
              audioFileSize={{ width: '160', height: '56' }}
            />

            {/* Content */}
            <Box
              sx={{
                p: 2,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
              }}>
              <Typography
                variant="h6"
                fontWeight={600}
                sx={{
                  mb: 1,
                  fontSize: '1.1rem',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minHeight: '2.6rem',
                }}>
                {story.properties.interview_title}
              </Typography>

              {story.properties.interview_description && (
                <Tooltip
                  title={
                    story.properties.interview_description.length > 100 ? story.properties.interview_description : ''
                  }
                  placement="top"
                  arrow>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.4,
                      flex: 1,
                      cursor: story.properties.interview_description.length > 100 ? 'pointer' : 'default',
                    }}>
                    {story.properties.interview_description}
                  </Typography>
                </Tooltip>
              )}
            </Box>
          </Paper>
        </Link>
      ))}
    </Box>
  );
};
