'use client';

import React, { createContext, useContext } from 'react';
import { Citation } from '@/types/chat';

type SearchType = 'bm25' | 'vector' | 'hybrid';

type ChatContextValue = {
  /** Override citation click behavior */
  onCitationClick?: (citation: Citation) => void;
  /** Override search results handler */
  onSearchResults?: (results: Citation[], query: string, type: SearchType) => void;
  /** Override goBack navigation (e.g., within a drawer) */
  onGoBack?: () => void;
  /** Override openTranscript navigation */
  onOpenTranscript?: (citation: Citation) => void;
  /** View all sources for a message */
  onViewSources?: (citations: Citation[]) => void;
};

const ChatContext = createContext<ChatContextValue>({});

export const ChatContextProvider = ({
  value,
  children,
}: {
  value: ChatContextValue;
  children: React.ReactNode;
}) => <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;

export const useChatContext = () => useContext(ChatContext);
