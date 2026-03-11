'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Box } from '@mui/material';
import { Citation } from '@/types/chat';
import { ChatCitationChip } from './ChatCitationChip';

type Props = {
  content: string;
  citations?: Citation[];
  messageId?: string;
};

export const ChatMessageContent = ({ content, citations, messageId }: Props) => {
  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    citations?.forEach((c) => map.set(c.index, c));
    return map;
  }, [citations]);

  // Split content around citation patterns like [1], [2], etc. and render them as chips
  const renderContentWithCitations = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const index = parseInt(match[1], 10);
        const citation = citationMap.get(index);
        if (citation) {
          return <ChatCitationChip key={i} citation={citation} siblings={citations} messageId={messageId} />;
        }
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  if (!content) {
    return (
      <Box sx={{ display: 'flex', gap: 0.5, py: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', animation: 'pulse 1.4s infinite', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', animation: 'pulse 1.4s infinite 0.2s', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled', animation: 'pulse 1.4s infinite 0.4s', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
      </Box>
    );
  }

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => {
          // Process children to replace citation patterns with chips
          const processed = React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return <>{renderContentWithCitations(child)}</>;
            }
            return child;
          });
          return <p>{processed}</p>;
        },
        li: ({ children }) => {
          const processed = React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return <>{renderContentWithCitations(child)}</>;
            }
            return child;
          });
          return <li>{processed}</li>;
        },
        strong: ({ children }) => {
          const processed = React.Children.map(children, (child) => {
            if (typeof child === 'string') {
              return <>{renderContentWithCitations(child)}</>;
            }
            return child;
          });
          return <strong>{processed}</strong>;
        },
      }}>
      {content}
    </ReactMarkdown>
  );
};
