import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { durationFormatHandler } from '@/app/utils/util';
import { colors } from '@/lib/theme';
import { Testimonies } from '@/types/weaviate';
import { Box, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Link from 'next/link';
import { WeaviateReturn } from 'weaviate-client';
import { ListViewNerChips } from './ListViewNerChips';
import { ExpandableDescription } from './ExpandableDescription';
import { NerLabel } from '@/types/ner';
import { VideoThumbnail } from './VideoThumbnail';

export const ListView = () => {
  const { stories, nerFilters } = useSemanticSearchStore();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const storiesTestimonies = stories as WeaviateReturn<Testimonies> | null;
  const storiesFilteredByNer = storiesTestimonies?.objects.filter((story) =>
    nerFilters.length > 0 ? story.properties.ner_labels.some((label: NerLabel) => nerFilters.includes(label)) : true,
  );

  if (!storiesFilteredByNer || storiesFilteredByNer.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{
            mb: 2,
            fontSize: { xs: '1rem', md: '1.25rem' },
            textAlign: 'center',
          }}>
          No stories available for the selected filters.
        </Typography>
      </Box>
    );
  }

  if (isMobile) {
    // Mobile Card Layout
    return (
      <Box
        id="list-view-mobile"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          pb: 2,
        }}>
        {storiesFilteredByNer?.map((story, index) => (
          <Link
            key={`mobile-card-${story.uuid}-${index}`}
            href={`/story/${story.uuid}`}
            style={{ textDecoration: 'none', cursor: 'pointer' }}>
            <Box
              sx={{
                bgcolor: 'white',
                borderRadius: 2,
                border: `1px solid ${colors.common.border}`,
                p: 2,
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: colors.grey[100],
                  borderColor: colors.primary.main,
                  boxShadow: 2,
                },
              }}>
              {/* Header with Thumbnail and Title */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  mb: 1.5,
                  alignItems: 'flex-start',
                }}>
                {/* Thumbnail */}
                <VideoThumbnail story={story} fontSize={10} audioFileSize={{ width: '40', height: '25' }} />
              </Box>

              {/* Title and Duration */}
              <Box sx={{ minWidth: 0, flex: 1 }} id="title-duration">
                <Typography
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{
                    fontSize: '1.1rem',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: 'black',
                    mb: 0.5,
                  }}>
                  {story.properties.interview_title}
                </Typography>

                <Typography
                  variant="body2"
                  fontWeight={500}
                  sx={{
                    display: isMobile ? 'none' : 'block',
                    color: colors.text.secondary,
                    fontSize: '0.875rem',
                  }}>
                  Duration: {durationFormatHandler(story.properties.interview_duration)}
                </Typography>
              </Box>

              {/* Description */}
              <Box sx={{ minWidth: 0 }}>
                {story.properties.interview_description ? (
                  <ExpandableDescription text={story.properties.interview_description} />
                ) : (
                  <Typography
                    variant="body2"
                    color="text.disabled"
                    sx={{
                      fontStyle: 'italic',
                      fontSize: '0.875rem',
                    }}>
                    No description available
                  </Typography>
                )}
              </Box>
            </Box>
          </Link>
        ))}
      </Box>
    );
  }

  // Desktop Table Layout
  return (
    <Box
      id="list-view"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}>
      {/* Table Header */}
      <Box
        sx={{
          display: 'grid',
          alignItems: 'start',
          gridTemplateColumns: '120px 200px 1fr 100px',
          gap: 2,
          p: 2.5,
          bgcolor: colors.grey[100],
          borderRadius: 1,
          fontWeight: 600,
          fontSize: '0.875rem',
          color: colors.text.primary,
        }}>
        <Box>Thumbnail</Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}>
          Recording
        </Box>
        <Box>Description</Box>
        <Box
          sx={{
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
          }}>
          Duration
        </Box>
      </Box>

      {/* Table Rows */}
      {storiesFilteredByNer?.map((story, index) => (
        <Link
          key={`list-${story.uuid}-${index}`}
          href={`/story/${story.uuid}`}
          style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '120px 200px 1fr 100px',
              gap: 2,
              p: 2.5,
              alignItems: 'start',
              bgcolor: colors.common.white,
              borderRadius: 1,
              border: `1px solid ${colors.common.border}`,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: colors.grey[100],
                borderColor: colors.primary.main,
                boxShadow: 1,
              },
            }}>
            {/* Thumbnail */}
            <VideoThumbnail story={story} fontSize={10} audioFileSize={{ width: '40', height: '25' }} />

            {/* Recording Title */}
            <Box
              sx={{
                paddingTop: 0.5,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
              }}>
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
                  color: 'black',
                }}>
                {story.properties.interview_title}
              </Typography>
            </Box>

            {/* Description */}
            <Box sx={{ minWidth: 0 }} display="flex" flexDirection="column" justifyContent="center">
              <Box display="flex" flexDirection="column" gap={1}>
                {story.properties.interview_description ? (
                  <ExpandableDescription
                    text={story.properties.interview_description}
                    collapsedLines={3}
                    fontSize={'0.775rem'}
                  />
                ) : (
                  <Typography
                    variant="body2"
                    color="text.disabled"
                    sx={{
                      fontStyle: 'italic',
                      fontSize: '0.875rem',
                    }}>
                    No description available
                  </Typography>
                )}
                <ListViewNerChips story={story} />
              </Box>
            </Box>

            {/* Duration */}
            <Box
              sx={{
                paddingTop: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Typography
                variant="body2"
                fontWeight={500}
                sx={{
                  color: 'black',
                  fontSize: '0.75rem',
                }}>
                {durationFormatHandler(story.properties.interview_duration)}
              </Typography>
            </Box>
          </Box>
        </Link>
      ))}
    </Box>
  );
};
