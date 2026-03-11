import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { ChatMessage, Citation, ChatStreamChunk } from '@/types/chat';

type SidePanelMode = 'hidden' | 'recording' | 'search' | 'transcript';
type SearchType = 'bm25' | 'vector' | 'hybrid';

type ChatStore = {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingStatus: string | null;
  sidePanelMode: SidePanelMode;
  activeCitation: Citation | null;
  searchResults: Citation[];
  selectionSearchQuery: string;
  transcriptCitation: Citation | null;
  previousMode: SidePanelMode | null;
  activeCitationSiblings: Citation[];
  selectionSearchType: SearchType;
  citationOpenedViaChip: boolean;
  hoveredCitationIndex: number | null;
  hoveredFromPanel: boolean;
  activePromptText: string;
  sidePanelDetailView: boolean;
  scrollToCitationIndex: number | null;
  activeAssistantMessageId: string | null;

  sendMessage: (content: string) => Promise<void>;
  setActiveCitation: (citation: Citation, siblings?: Citation[]) => void;
  setHoveredCitationIndex: (index: number | null, fromPanel?: boolean) => void;
  closeSidePanel: () => void;
  setSearchResults: (results: Citation[], query: string, type?: SearchType) => void;
  selectSearchResult: (citation: Citation) => void;
  clearMessages: () => void;
  openTranscript: (citation: Citation) => void;
  goBack: () => void;
  showSourcesForMessage: (assistantMessageId: string) => void;
  setSidePanelDetailView: (detail: boolean) => void;
  scrollToCitation: (index: number) => void;
  clearScrollToCitation: () => void;
};

let messageIdCounter = Date.now();
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

export const useChatStore = create<ChatStore>()(
  devtools(
    persist(
    (set, get) => ({
      messages: [],
      isStreaming: false,
      streamingStatus: null,
      sidePanelMode: 'hidden',
      activeCitation: null,
      searchResults: [],
      selectionSearchQuery: '',
      transcriptCitation: null,
      previousMode: null,
      activeCitationSiblings: [],
      selectionSearchType: 'hybrid',
      citationOpenedViaChip: false,
      hoveredCitationIndex: null,
      hoveredFromPanel: false,
      activePromptText: '',
      sidePanelDetailView: false,
      scrollToCitationIndex: null,
      activeAssistantMessageId: null,

      sendMessage: async (content: string) => {
        const userMessage: ChatMessage = {
          id: nextId(),
          role: 'user',
          content,
        };

        const assistantMessage: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: '',
        };

        set(
          (state) => ({
            messages: [...state.messages, userMessage, assistantMessage],
            isStreaming: true,
          }),
          false,
          'sendMessage:start',
        );

        try {
          const { messages } = get();
          // Build conversation history (exclude the empty assistant placeholder)
          const apiMessages = messages
            .filter((m) => m.content.length > 0)
            .map((m) => ({ role: m.role, content: m.content }));

          const response = await fetch('/api/discover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: apiMessages,
              query: content,
            }),
          });

          if (!response.ok) {
            throw new Error(`Chat API error: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let buffer = '';
          let citations: Citation[] | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const chunk = JSON.parse(trimmed.slice(6)) as ChatStreamChunk;

                if (chunk.type === 'status') {
                  set({ streamingStatus: chunk.status }, false, 'sendMessage:status');
                } else if (chunk.type === 'citations') {
                  citations = chunk.citations;
                } else if (chunk.type === 'text') {
                  set(
                    (state) => {
                      const msgs = [...state.messages];
                      const last = msgs[msgs.length - 1];
                      if (last?.role === 'assistant') {
                        msgs[msgs.length - 1] = {
                          ...last,
                          content: last.content + chunk.content,
                          citations,
                        };
                      }
                      return { messages: msgs, streamingStatus: null };
                    },
                    false,
                    'sendMessage:text',
                  );
                } else if (chunk.type === 'done') {
                  // Ensure final citations are set and auto-open All Sources panel
                  set(
                    (state) => {
                      const msgs = [...state.messages];
                      const last = msgs[msgs.length - 1];
                      if (last?.role === 'assistant' && citations) {
                        msgs[msgs.length - 1] = { ...last, citations };
                      }

                      // Normalize comma-separated citations like [41, 49] → [41][49]
                      let responseText = (last?.content ?? '').replace(
                        /\[(\d+(?:\s*,\s*\d+)+)\]/g,
                        (_, nums: string) => nums.split(',').map((n: string) => `[${n.trim()}]`).join(''),
                      );

                      // Filter to only citations actually referenced in the response,
                      // then renumber sequentially (1, 2, 3...) in order of first appearance
                      const citedIndexesOrdered: number[] = [];
                      const seenIndexes = new Set<number>();
                      const citationPattern = /\[(\d+)\]/g;
                      let m;
                      while ((m = citationPattern.exec(responseText)) !== null) {
                        const idx = parseInt(m[1], 10);
                        if (!seenIndexes.has(idx)) {
                          seenIndexes.add(idx);
                          citedIndexesOrdered.push(idx);
                        }
                      }

                      // Build old→new index mapping
                      const indexMap = new Map<number, number>();
                      citedIndexesOrdered.forEach((oldIdx, i) => indexMap.set(oldIdx, i + 1));

                      // Renumber references in the response text
                      responseText = responseText.replace(/\[(\d+)\]/g, (match, num) => {
                        const newIdx = indexMap.get(parseInt(num, 10));
                        return newIdx !== undefined ? `[${newIdx}]` : match;
                      });

                      // Create renumbered citations
                      const citationsByOldIndex = new Map<number, Citation>();
                      citations?.forEach((c) => citationsByOldIndex.set(c.index, c));
                      const renumberedCitations = citedIndexesOrdered
                        .map((oldIdx) => {
                          const c = citationsByOldIndex.get(oldIdx);
                          if (!c) return null;
                          return { ...c, index: indexMap.get(oldIdx)! };
                        })
                        .filter((c): c is Citation => c !== null);

                      // Store renumbered citations and updated text on the message
                      if (last?.role === 'assistant' && renumberedCitations.length > 0) {
                        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: responseText, citations: renumberedCitations };
                      }

                      const firstCitation = renumberedCitations[0];
                      return {
                        messages: msgs,
                        isStreaming: false,
                        streamingStatus: null,
                        ...(firstCitation
                          ? {
                              activeCitation: firstCitation,
                              activeCitationSiblings: renumberedCitations,
                              sidePanelMode: 'recording' as const,
                              citationOpenedViaChip: false,
                              activePromptText: content,
                              sidePanelDetailView: false,
                              activeAssistantMessageId: assistantMessage.id,
                            }
                          : {}),
                      };
                    },
                    false,
                    'sendMessage:done',
                  );
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }

          // In case we never got a 'done' event
          set({ isStreaming: false, streamingStatus: null }, false, 'sendMessage:streamEnd');
        } catch (error) {
          console.error('Chat error:', error);
          set(
            (state) => {
              const msgs = [...state.messages];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant' && !last.content) {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: 'Sorry, something went wrong. Please try again.',
                };
              }
              return { messages: msgs, isStreaming: false, streamingStatus: null };
            },
            false,
            'sendMessage:error',
          );
        }
      },

      setActiveCitation: (citation: Citation, siblings?: Citation[]) => {
        const msgs = get().messages;
        let promptText = get().activePromptText;
        let assistantMsgId = get().activeAssistantMessageId;
        // Find the assistant message and prompt text for this citation's siblings
        if (siblings && siblings.length > 0) {
          for (let i = 0; i < msgs.length; i++) {
            const msg = msgs[i];
            if (msg.role === 'assistant' && msg.citations && msg.citations.length === siblings.length &&
                msg.citations[0]?.theirstoryId === siblings[0]?.theirstoryId &&
                Math.abs((msg.citations[0]?.startTime ?? -1) - (siblings[0]?.startTime ?? -2)) < 0.01) {
              assistantMsgId = msg.id;
              for (let j = i - 1; j >= 0; j--) {
                if (msgs[j].role === 'user') { promptText = msgs[j].content; break; }
              }
              break;
            }
          }
        }
        set({
          activeCitation: citation,
          sidePanelMode: 'recording',
          activeCitationSiblings: siblings ?? [],
          citationOpenedViaChip: true,
          activePromptText: promptText,
          sidePanelDetailView: true,
          activeAssistantMessageId: assistantMsgId,
        }, false, 'setActiveCitation');
      },

      setHoveredCitationIndex: (index: number | null, fromPanel?: boolean) =>
        set({ hoveredCitationIndex: index, hoveredFromPanel: fromPanel ?? false }, false, 'setHoveredCitationIndex'),

      closeSidePanel: () =>
        set(
          {
            sidePanelMode: 'hidden',
            activeCitation: null,
            searchResults: [],
            transcriptCitation: null,
            previousMode: null,
            activeCitationSiblings: [],
            activePromptText: '',
            sidePanelDetailView: false,
            activeAssistantMessageId: null,
          },
          false,
          'closeSidePanel',
        ),

      setSearchResults: (results: Citation[], query: string, type?: SearchType) =>
        set(
          {
            searchResults: results,
            selectionSearchQuery: query,
            sidePanelMode: 'search',
            selectionSearchType: type ?? 'hybrid',
          },
          false,
          'setSearchResults',
        ),

      selectSearchResult: (citation: Citation) =>
        set(
          {
            transcriptCitation: citation,
            sidePanelMode: 'transcript',
            previousMode: 'search',
          },
          false,
          'selectSearchResult',
        ),

      clearMessages: () =>
        set(
          {
            messages: [],
            isStreaming: false,
            streamingStatus: null,
            sidePanelMode: 'hidden',
            activeCitation: null,
            searchResults: [],
            transcriptCitation: null,
            previousMode: null,
            activeCitationSiblings: [],
            activePromptText: '',
            sidePanelDetailView: false,
            activeAssistantMessageId: null,
          },
          false,
          'clearMessages',
        ),

      openTranscript: (citation: Citation) =>
        set(
          (state) => ({
            transcriptCitation: citation,
            sidePanelMode: 'transcript',
            previousMode: state.sidePanelMode,
          }),
          false,
          'openTranscript',
        ),

      goBack: () =>
        set(
          (state) => ({
            sidePanelMode: state.previousMode ?? 'hidden',
            previousMode: null,
            transcriptCitation: null,
          }),
          false,
          'goBack',
        ),

      showSourcesForMessage: (assistantMessageId: string) => {
        const msgs = get().messages;
        const msgIdx = msgs.findIndex((m) => m.id === assistantMessageId);
        if (msgIdx === -1) return;
        const msg = msgs[msgIdx];
        const citations = msg.citations ?? [];
        if (citations.length === 0) return;
        let promptText = '';
        for (let j = msgIdx - 1; j >= 0; j--) {
          if (msgs[j].role === 'user') { promptText = msgs[j].content; break; }
        }
        set({
          activeCitation: citations[0],
          activeCitationSiblings: citations,
          sidePanelMode: 'recording',
          citationOpenedViaChip: false,
          activePromptText: promptText,
          sidePanelDetailView: false,
          activeAssistantMessageId: assistantMessageId,
        }, false, 'showSourcesForMessage');
      },

      setSidePanelDetailView: (detail: boolean) =>
        set({ sidePanelDetailView: detail }, false, 'setSidePanelDetailView'),

      scrollToCitation: (index: number) =>
        set({ scrollToCitationIndex: index }, false, 'scrollToCitation'),

      clearScrollToCitation: () =>
        set({ scrollToCitationIndex: null }, false, 'clearScrollToCitation'),
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({ messages: state.messages }),
    },
    ),
    { name: 'Chat Store' },
  ),
);
