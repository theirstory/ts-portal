import Anthropic from '@anthropic-ai/sdk';
import { retrieveChunksForChat, retrieveAllChapterSynopses } from '@/lib/weaviate/chatRetrieval';
import { ChatRequest, Citation } from '@/types/chat';

const anthropic = new Anthropic();

function buildSystemPrompt(allCitations: Citation[]): string {
  const sourcesBlock = allCitations
    .map((c) => {
      if (c.isChapterSynopsis) {
        return `[${c.index}] (Chapter Summary) Interview: "${c.interviewTitle}" | Chapter: "${c.sectionTitle}" | Time: ${formatTime(c.startTime)}–${formatTime(c.endTime)}\nSummary: ${c.transcription}`;
      }
      return `[${c.index}] (Transcript Excerpt) Speaker: ${c.speaker} | Interview: "${c.interviewTitle}" | Section: "${c.sectionTitle}" | Time: ${formatTime(c.startTime)}–${formatTime(c.endTime)}\n"${c.transcription}"`;
    })
    .join('\n\n');

  return `You are a helpful research assistant for an oral history interview archive. Answer questions based on the sources provided below. Sources include both chapter summaries (high-level overviews) and transcript excerpts (detailed quotes).

RULES:
- Use numbered citations like [1], [2] to reference sources. Always cite your sources.
- You MUST cite every source that is relevant to your answer, including chapter summaries.
- Include direct quotes from transcript excerpts when relevant, using quotation marks.
- If the sources don't contain enough information to answer, say so honestly.
- Be concise but thorough. Synthesize information across multiple sources when relevant.
- When multiple speakers discuss the same topic, note the different perspectives.
- For broad questions about themes or patterns, draw on the chapter summaries to cover the full breadth of the collection.

SOURCES:
${sourcesBlock}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const { messages, query } = body;

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

          const systemPrompt = buildSystemPrompt(allCitations);
          const citations = allCitations;

          // Send citations to client
          controller.enqueue(encoder.encode(sseEvent({ type: 'citations', citations })));

          // Phase 3: Generating response
          controller.enqueue(encoder.encode(sseEvent({ type: 'status', status: 'Generating response...' })));

          const anthropicMessages = messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: anthropicMessages,
          });

          for await (const event of anthropicStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(
                encoder.encode(sseEvent({ type: 'text', content: event.delta.text })),
              );
            }
          }

          controller.enqueue(encoder.encode(sseEvent({ type: 'done' })));
        } catch (err) {
          console.error('Anthropic streaming error:', err);
          controller.enqueue(
            encoder.encode(sseEvent({ type: 'text', content: 'Sorry, an error occurred while generating the response.' })),
          );
          controller.enqueue(encoder.encode(sseEvent({ type: 'done' })));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json({ error: 'Failed to process chat request' }, { status: 500 });
  }
}
