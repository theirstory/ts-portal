'use client';

import React, { createContext, useContext } from 'react';
import { Citation } from '@/types/chat';

type SearchType = 'bm25' | 'vector' | 'hybrid';

type ChatInteractionContextValue = {
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

const ChatInteractionContext = createContext<ChatInteractionContextValue>({});

export const ChatInteractionProvider = ({
  value,
  children,
}: {
  value: ChatInteractionContextValue;
  children: React.ReactNode;
}) => <ChatInteractionContext.Provider value={value}>{children}</ChatInteractionContext.Provider>;

export const useChatInteraction = () => useContext(ChatInteractionContext);
