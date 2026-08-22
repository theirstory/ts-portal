'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { colors } from '@/lib/theme';
import type { MultimodalResult } from '@/lib/weaviate/multimodalSearch';
import { queryTerms } from './queryTerms';
import { PageImageWithHighlights } from './PageImageWithHighlights';
import { ArchivalRecord } from './ArchivalRecord';

type Props = {
  result: MultimodalResult | null;
  query: string;
  onClose: () => void;
};

/**
 * Highlight query terms in the OCR text so it is obvious which words on the page the
 * match came from — and, for photographs, obvious that there were none.
 */
function highlight(text: string, query: string): React.ReactNode {
  const terms = queryTerms(query);

  if (!terms.length || !text) return text;

  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

  return text.split(pattern).map((part, index) =>
    terms.includes(part.toLowerCase()) ? (
      <Box key={index} component="mark" sx={{ backgroundColor: '#fff3a3', px: 0.2 }}>
        {part}
      </Box>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );
}

export function ExhibitDetailDrawer({ result, query, onClose }: Props) {
  const isExhibit = result !== null && result.sourceType !== 'recording';

  return (
    <Drawer
      anchor="right"
      open={isExhibit}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', md: 720 }, maxWidth: '100%' } }}>
      {result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              p: 2,
              borderBottom: `1px solid ${colors.grey[200]}`,
            }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
                {result.title || 'Untitled'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                {result.exhibitNumber && <Chip size="small" label={result.exhibitNumber} />}
                {result.pageCount !== undefined && result.pageCount > 1 && (
                  <Chip size="small" variant="outlined" label={`Page ${result.page} of ${result.pageCount}`} />
                )}
                {result.imageCategory && <Chip size="small" variant="outlined" label={result.imageCategory} />}
                {result.embeddedModality && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`embedded: ${result.embeddedModality}`}
                    sx={{ fontFamily: 'monospace' }}
                  />
                )}
              </Box>

              {/*
                The Bates number is how a filing cites this page, and whether it was redacted
                changes whether it can be quoted — so both belong beside the title rather than
                below a full-page image. The complete record still follows the page text.
              */}
              {(result.archival?.batesForPage || result.archival?.batesNumber) && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.75,
                    color: colors.text?.secondary,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: '0.7rem',
                  }}>
                  {result.archival.batesForPage || result.archival.batesNumber}
                  {result.archival.batesForPageIsDerived ? ' (derived)' : ''}
                  {result.archival.caseNumbers[0] ? ` · ${result.archival.caseNumbers[0]}` : ''}
                  {result.archival.redactionTypes.length ? ` · redacted: ${result.archival.redactionTypes.join(', ')}` : ''}
                </Typography>
              )}
            </Box>
            <IconButton onClick={onClose} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {result.imageUrl && (
              <Box
                sx={{
                  mb: 2,
                  border: `1px solid ${colors.grey[200]}`,
                  borderRadius: 1,
                  overflow: 'hidden',
                  backgroundColor: colors.grey[100],
                }}>
                <PageImageWithHighlights imageUrl={result.imageUrl} alt={result.title} query={query} mode={result.mode} />
              </Box>
            )}

            <Typography variant="subtitle2" sx={{ mb: 1, color: colors.text?.secondary }}>
              Page text
            </Typography>

            {result.snippet ? (
              <Typography
                variant="body2"
                component="div"
                sx={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.8rem' }}>
                {highlight(result.snippet, query)}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                This page has no OCR text. It was retrieved from the image alone, in the same vector space as
                the transcripts.
              </Typography>
            )}

            <ArchivalRecord result={result} />
          </Box>

          <Box sx={{ p: 2, borderTop: `1px solid ${colors.grey[200]}` }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                {result.collectionName}
                {result.folderName ? ` · ${result.folderName}` : ''}
              </Typography>
              {result.archival?.idlShortId && (
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {result.archival.idlShortId}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
