import { retrieveChunksForChat, retrieveAllChapterSynopses } from '@/lib/weaviate/chatRetrieval';
import { ChatRequest, Citation, ZoteroContextItem } from '@/types/chat';
import { createChatProvider, getChatProviderSettings } from '@/lib/ai/chatProvider';
import { getZoteroSession } from '@/lib/zotero/cookies';
import { searchUserLibrary } from '@/lib/zotero/client';
import { isZoteroEnabled } from '@/config/organizationConfig';

function buildSystemPrompt(allCitations: Citation[], responseLanguage: string, zoteroItems?: ZoteroContextItem[]): string {
  const sourcesBlock = allCitations
    .map((c) => {
      if (c.isChapterSynopsis) {
        return `[${c.index}] (Chapter Summary) Interview: "${c.interviewTitle}" | Chapter: "${c.sectionTitle}" | Time: ${formatTime(c.startTime)}–${formatTime(c.endTime)}\nSummary: ${c.transcription}`;
      }
      return `[${c.index}] (Transcript Excerpt) Speaker: ${c.speaker} | Interview: "${c.interviewTitle}" | Section: "${c.sectionTitle}" | Time: ${formatTime(c.startTime)}–${formatTime(c.endTime)}\n"${c.transcription}"`;
    })
    .join('\n\n');

  const zoteroBlock = zoteroItems?.length
    ? `\n\nZOTERO LIBRARY CONTEXT:
The researcher has the following related items in their personal Zotero library. Reference these when relevant to connect the archive sources with their existing research. Cite Zotero items as [Z1], [Z2], etc.
${zoteroItems.map((item, i) => `[Z${i + 1}] "${item.title}" by ${item.creators || 'Unknown'}. ${item.date || 'n.d.'}${item.abstractNote ? `. ${item.abstractNote.slice(0, 200)}` : ''}`).join('\n')}`
    : '';

  return `You are a helpful research assistant for an oral history interview archive. Answer questions based on the sources provided below. Sources include both chapter summaries (high-level overviews) and transcript excerpts (detailed quotes).

RULES:
- Use numbered citations like [1], [2] to reference sources.
- Always cite your sources next to the relevant information. Not at the end of the answer, but right after the fact. For example: "The interviewee discusses their childhood in New York [3]."
- Only use bracketed citations for source numbers.
- The only valid citation format is a single number in brackets, like [3].
- Never output ranges like [3-5].
- Never output comma-separated or grouped citations inside one pair of brackets, like [3, 4] or [3, 5-7].
- If you need multiple citations, write them as separate adjacent citations, like [3][4][5].
- Never put timestamps in brackets.
- You MUST cite every source that is relevant to your answer, including chapter summaries.
- Include direct quotes from transcript excerpts when relevant, using quotation marks.
- If the sources don't contain enough information to answer, say so honestly.
- Be concise but thorough. Synthesize information across multiple sources when relevant.
- When multiple speakers discuss the same topic, note the different perspectives.
- For broad questions about themes or patterns, draw on the chapter summaries to cover the full breadth of the collection.
- Write the entire answer in ${responseLanguage}.
- If you include a direct quote from a source, keep the quote in its original language, but keep your explanation in ${responseLanguage}.${zoteroItems?.length ? '\n- When referencing items from the researcher\'s Zotero library, cite them as [Z1], [Z2], etc. and note that these come from their personal library.' : ''}

SOURCES:
${sourcesBlock}${zoteroBlock}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function getUserFacingDiscoverError(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'Sorry, an error occurred while generating the response.');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { messages, query, responseLanguage, includeZoteroContext } = body;

    if (!query?.trim()) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Phase 1: Search the archive
          controller.enqueue(encoder.encode(sseEvent({ type: 'status', status: 'Searching the archive...' })));

          const [chunkCitations, synopses] = await Promise.all([
            retrieveChunksForChat(query, 20),
            retrieveAllChapterSynopses(),
          ]);

          // Phase 1b: Search Zotero library if authenticated
          let zoteroItems: ZoteroContextItem[] = [];
          if (isZoteroEnabled && includeZoteroContext) {
            try {
              const zoteroSession = await getZoteroSession();
              if (zoteroSession) {
                controller.enqueue(encoder.encode(sseEvent({ type: 'status', status: 'Searching your Zotero library...' })));
                const results = await searchUserLibrary(zoteroSession.apiKey, zoteroSession.userID, query, 8);
                zoteroItems = results.map((r) => ({
                  key: r.key,
                  title: r.title,
                  creators: r.creators,
                  date: r.date,
                  itemType: r.itemType,
                  abstractNote: r.abstractNote,
                  url: r.url,
                }));
                if (zoteroItems.length > 0) {
                  controller.enqueue(encoder.encode(sseEvent({ type: 'zotero_context', items: zoteroItems })));
                }
              }
            } catch (zoteroError) {
              console.error('Zotero search in chat failed (non-fatal):', zoteroError);
            }
          }

          // Phase 2: Preparing sources
          controller.enqueue(encoder.encode(sseEvent({ type: 'status', status: 'Gathering sources...' })));

          const synopsisCitations: Citation[] = synopses.map((s) => ({
            index: 0,
            transcription: s.synopsis,
            speaker: '',
            interviewTitle: s.interviewTitle,
            sectionTitle: s.sectionTitle,
            startTime: s.startTime,
            endTime: s.endTime,
            theirstoryId: s.theirstoryId,
            videoUrl: s.videoUrl,
            isAudioFile: s.isAudioFile,
            isChapterSynopsis: true,
          }));

          const allCitations = [...chunkCitations, ...synopsisCitations].map((c, i) => ({
            ...c,
            index: i + 1,
          }));

          const systemPrompt = buildSystemPrompt(allCitations, responseLanguage?.trim() || 'English', zoteroItems);
          const citations = allCitations;

          // Send citations to client
          controller.enqueue(encoder.encode(sseEvent({ type: 'citations', citations })));

          // Phase 3: Generating response
          controller.enqueue(encoder.encode(sseEvent({ type: 'status', status: 'Generating response...' })));

          const providerSettings = getChatProviderSettings();
          const provider = createChatProvider(providerSettings);
          const providerMessages = messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

          for await (const text of provider.streamText({
            model: providerSettings.model,
            maxTokens: 2048,
            systemPrompt,
            messages: providerMessages,
          })) {
            controller.enqueue(encoder.encode(sseEvent({ type: 'text', content: text })));
          }

          controller.enqueue(encoder.encode(sseEvent({ type: 'done' })));
        } catch (err) {
          console.error('Chat provider streaming error:', err);
          controller.enqueue(encoder.encode(sseEvent({ type: 'text', content: getUserFacingDiscoverError(err) })));
          controller.enqueue(encoder.encode(sseEvent({ type: 'done' })));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json({ error: 'Failed to process chat request' }, { status: 500 });
  }
}
