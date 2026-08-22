'use client';

import React from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { colors } from '@/lib/theme';
import type { MultimodalResult } from '@/lib/weaviate/multimodalSearch';

type Props = { result: MultimodalResult };

type Row = { label: string; value: string; hint?: string; mono?: boolean };

function list(values: string[] | undefined): string {
  return (values ?? []).filter(Boolean).join(', ');
}

/**
 * The Industry Documents Library's own record for this exhibit.
 *
 * A researcher citing one of these needs the Bates number and the case it was produced in,
 * needs to know whether it was redacted before quoting it, and needs the author and
 * recipient to place it. That is metadata the library holds and the portal was previously
 * discarding, so it is shown in full rather than summarised — empty fields are dropped
 * instead of being rendered as blanks, since absence is common and normal here.
 */
export function ArchivalRecord({ result }: Props) {
  const archival = result.archival;
  if (!archival) return null;

  const groups: { heading: string; rows: Row[] }[] = [
    {
      heading: 'Citation',
      rows: [
        {
          label: 'Bates',
          // The per-page number is what a filing cites; the document-level one starts the range.
          value: archival.batesForPage || archival.batesNumber,
          hint: archival.batesForPageIsDerived
            ? `calculated for page ${result.page} from ${archival.batesNumber} — verify against the stamp on the page`
            : undefined,
          mono: true,
        },
        { label: 'Exhibit', value: result.exhibitNumber ?? '', mono: true },
        { label: 'Case', value: list(archival.caseNumbers), mono: true },
        { label: 'Document id', value: result.sourceId ?? '', mono: true },
      ],
    },
    {
      heading: 'People',
      rows: [
        { label: 'Author', value: list(archival.authors) },
        { label: 'Recipient', value: list(archival.recipients) },
        { label: 'Copied', value: list(archival.copied) },
        { label: 'Custodian', value: list(archival.custodians) },
      ],
    },
    {
      heading: 'Correspondence',
      rows: [
        { label: 'Thread', value: archival.conversation },
        {
          label: 'Sent',
          value: [archival.dateSent, archival.timeSent].filter(Boolean).join(' '),
        },
        { label: 'Received', value: archival.dateReceived },
        { label: 'Attachments', value: list(archival.attachments), mono: true },
      ],
    },
    {
      heading: 'Document',
      rows: [
        { label: 'Date', value: archival.documentDate },
        { label: 'Genre', value: archival.genre },
        { label: 'Industry', value: archival.industry },
        { label: 'Drugs', value: list(archival.drugs) },
        { label: 'Language', value: archival.language },
        { label: 'Also titled', value: archival.alternateTitle },
      ],
    },
    {
      heading: 'Production',
      rows: [
        { label: 'Original file', value: archival.originalFilename },
        { label: 'Format', value: archival.originalFormat },
        { label: 'Path', value: archival.productionPath, mono: true },
        {
          label: 'Redacted',
          value: archival.redacted,
          hint: archival.redactionTypes.length
            ? `${list(archival.redactionTypes)}${archival.redactedBy.length ? ` — by ${list(archival.redactedBy)}` : ''}`
            : undefined,
        },
        { label: 'Availability', value: list(archival.availability) },
        { label: 'Added to library', value: archival.dateAdded },
      ],
    },
  ];

  const populated = groups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => row.value) }))
    .filter((group) => group.rows.length);

  if (!populated.length) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, color: colors.text?.secondary }}>
        Archival record
      </Typography>

      <Box
        sx={{
          border: `1px solid ${colors.grey[200]}`,
          borderRadius: 1,
          overflow: 'hidden',
        }}>
        {populated.map((group, groupIndex) => (
          <Box key={group.heading}>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                backgroundColor: colors.grey[100],
                borderTop: groupIndex ? `1px solid ${colors.grey[200]}` : 'none',
              }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, letterSpacing: 0.4, fontSize: '0.62rem', color: colors.text?.secondary }}>
                {group.heading.toUpperCase()}
              </Typography>
            </Box>

            {group.rows.map((row) => (
              <Box
                key={row.label}
                sx={{
                  display: 'flex',
                  gap: 1.5,
                  px: 1.5,
                  py: 0.6,
                  borderTop: `1px solid ${colors.grey[100]}`,
                  alignItems: 'baseline',
                }}>
                <Typography
                  variant="caption"
                  sx={{ width: 116, flexShrink: 0, color: colors.text?.secondary, fontSize: '0.72rem' }}>
                  {row.label}
                </Typography>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.78rem',
                      fontFamily: row.mono ? 'ui-monospace, SFMono-Regular, monospace' : undefined,
                      wordBreak: 'break-word',
                    }}>
                    {row.value}
                  </Typography>
                  {row.hint && (
                    <Typography variant="caption" sx={{ color: colors.text?.secondary, fontSize: '0.68rem' }}>
                      {row.hint}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      {result.sourceUrl && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: colors.text?.secondary }}>
          Full record:{' '}
          <Link href={result.sourceUrl} target="_blank" rel="noopener noreferrer">
            {result.sourceUrl.replace('https://www.', '')}
          </Link>
        </Typography>
      )}
    </Box>
  );
}
