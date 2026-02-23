'use client';

import React from 'react';
import Box from '@mui/material/Box';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits text by query (case-insensitive) and wraps each match in a highlight box.
 * Returns a React fragment; when query is empty, returns the plain text string.
 */
export function highlightSearchText(
  text: string,
  query: string,
  highlightSx?: React.CSSProperties | object,
): React.ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(q)})`, 'gi'));
  if (parts.length <= 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <Box
            component="mark"
            key={i}
            sx={{
              backgroundColor: 'rgba(255, 235, 59, 0.5)',
              padding: '0 1px',
              borderRadius: 0.25,
              ...highlightSx,
            }}>
            {part}
          </Box>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}
