'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import GraphicEqOutlinedIcon from '@mui/icons-material/GraphicEqOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import { AudioFileWave } from '@/app/assets/svg/AudioFileWave';
import { colors } from '@/lib/theme';
import type { MultimodalResult, SourceType } from '@/lib/weaviate/multimodalSearch';

type Props = {
  result: MultimodalResult;
  showScores: boolean;
  /** Highest ranking score in the current result set, used to scale the relevance bar. */
  topScore: number;
  onSelect: (result: MultimodalResult) => void;
};

const SOURCE_LABELS: Record<SourceType, string> = {
  recording: 'Recording',
  document: 'Document',
  image: 'Image',
};

/** Distinct accent per source type, so a mixed result list stays scannable. */
const SOURCE_ACCENTS: Record<SourceType, string> = {
  recording: colors.primary.main,
  document: colors.info?.main ?? '#2f6f9f',
  image: colors.success?.main ?? '#3f7d58',
};

function formatTimecode(seconds?: number): string {
  if (seconds === undefined || Number.isNaN(seconds)) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

function SourceIcon({ result, fontSize = 17 }: { result: MultimodalResult; fontSize?: number }) {
  const sx = { fontSize };

  if (result.sourceType === 'recording') {
    return result.isAudioFile ? <GraphicEqOutlinedIcon sx={sx} /> : <MovieOutlinedIcon sx={sx} />;
  }
  return result.sourceType === 'image' ? <ImageOutlinedIcon sx={sx} /> : <ArticleOutlinedIcon sx={sx} />;
}

/**
 * Every result gets a thumbnail, so the type and gist of a hit are legible at a glance
 * rather than only from its title: a page thumbnail for documents and images, a Mux poster
 * frame at the matched moment for video, and a waveform for audio, which has no frame.
 *
 * These are the small renders from `yarn oida:thumbnails`, not the full page images — those
 * run to 23 MB apiece, and a result page was pulling tens of megabytes to draw this column.
 */
function Thumbnail({ result, accent }: { result: MultimodalResult; accent: string }) {
  const [failed, setFailed] = React.useState(false);
  const src = result.thumbnailUrl && !failed ? result.thumbnailUrl : '';

  return (
    <Box
      sx={{
        position: 'relative',
        flexShrink: 0,
        width: { xs: 64, sm: 92 },
        height: { xs: 64, sm: 92 },
        borderRadius: 1,
        overflow: 'hidden',
        border: `1px solid ${colors.grey[200]}`,
        backgroundColor: colors.grey[100],
        display: 'grid',
        placeItems: 'center',
      }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        />
      ) : result.sourceType === 'recording' && result.isAudioFile ? (
        <AudioFileWave width="42" height="26" color={colors.grey[600]} />
      ) : (
        <Box sx={{ color: colors.grey[500], display: 'grid', placeItems: 'center' }}>
          <SourceIcon result={result} fontSize={26} />
        </Box>
      )}

      {result.sourceType === 'recording' && result.startTime !== undefined && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            px: 0.4,
            borderRadius: 0.5,
            fontSize: '0.62rem',
            backgroundColor: colors.common?.overlay ?? 'rgba(0,0,0,0.65)',
            color: '#fff',
          }}>
          {formatTimecode(result.startTime)}
        </Box>
      )}

      {result.sourceType !== 'recording' && result.pageCount !== undefined && result.pageCount > 1 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            px: 0.4,
            borderRadius: 0.5,
            fontSize: '0.62rem',
            backgroundColor: colors.common?.overlay ?? 'rgba(0,0,0,0.65)',
            color: '#fff',
          }}>
          {result.page}/{result.pageCount}
        </Box>
      )}

      <Box sx={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', backgroundColor: accent }} />
    </Box>
  );
}

export function MultimodalResultCard({ result, showScores, topScore, onSelect }: Props) {
  const accent = SOURCE_ACCENTS[result.sourceType];
  const hasSnippet = Boolean(result.snippet);
  // Relevance relative to the best hit in this set: an absolute cosine means little to a
  // reader, but "how close to the top result" is directly useful when scanning.
  //
  // A top score of zero means nothing was ranked — the browse listing — so the bar is
  // hidden rather than drawn empty next to a meaningless 0.00.
  const ranked = topScore > 0;
  const relative = ranked ? Math.max(Math.min(result.score / topScore, 1), 0) : 0;

  return (
    <Box
      onClick={() => onSelect(result)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(result);
        }
      }}
      sx={{
        display: 'flex',
        gap: 1.5,
        px: 1.5,
        py: 1.25,
        borderRadius: 1.5,
        border: `1px solid ${colors.grey[200]}`,
        backgroundColor: colors.common?.white ?? '#fff',
        cursor: 'pointer',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '&:hover': { boxShadow: 2, borderColor: accent },
        '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 2 },
      }}>
      <Thumbnail result={result} accent={accent} />

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, color: accent }}>
            <SourceIcon result={result} fontSize={15} />
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.3, fontSize: '0.66rem' }}>
              {SOURCE_LABELS[result.sourceType].toUpperCase()}
            </Typography>
          </Box>

          {result.exhibitNumber && (
            <Typography variant="caption" sx={{ color: colors.text?.secondary, fontSize: '0.66rem' }}>
              {result.exhibitNumber}
            </Typography>
          )}

          {result.sourceType === 'recording' && result.sectionTitle && (
            <Typography
              variant="caption"
              sx={{
                color: colors.text?.secondary,
                fontSize: '0.66rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 320,
              }}>
              {result.speaker ? `${result.speaker} · ` : ''}
              {result.sectionTitle}
            </Typography>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Relevance, as a bar plus the number behind it. */}
          {ranked && (
            <Tooltip
              title={
                result.mode === 'keyword'
                  ? `BM25 relevance ${result.score.toFixed(2)} — how well the exact terms match this text.`
                  : `Rank ${result.score.toFixed(3)} = raw certainty ${result.certainty.toFixed(3)} minus this source type's calibration offset.` +
                    (result.embeddedModality ? ` Embedded as ${result.embeddedModality}.` : '')
              }>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <Box sx={{ width: 54, height: 5, borderRadius: 3, backgroundColor: colors.grey[200] }}>
                  <Box sx={{ width: `${relative * 100}%`, height: '100%', borderRadius: 3, backgroundColor: accent }} />
                </Box>
                {showScores && (
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: 'monospace', fontSize: '0.64rem', color: colors.text?.secondary }}>
                    {result.mode === 'keyword' ? result.score.toFixed(1) : result.score.toFixed(2)}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          )}
        </Box>

        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            lineHeight: 1.3,
            mb: 0.25,
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
          {result.title || 'Untitled'}
        </Typography>

        {hasSnippet ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontSize: '0.82rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
            {result.snippet}
          </Typography>
        ) : (
          // Photographs carry no OCR text at all: they were retrieved from the image alone.
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', fontStyle: 'italic' }}>
            No text on this page — matched on the image itself.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
