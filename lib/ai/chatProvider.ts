import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/config/organizationConfig';

export type ChatProviderName = 'anthropic' | 'openai' | 'openai-compatible';

export type ChatProviderMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatProviderRequest = {
  model: string;
  systemPrompt: string;
  messages: ChatProviderMessage[];
  maxTokens: number;
};

export type ChatProviderSettings = {
  provider: ChatProviderName;
  model: string;
  baseUrl?: string;
  apiKey: string;
};

export type ChatProvider = {
  streamText(input: ChatProviderRequest): AsyncIterable<string>;
};

const DEFAULT_MODELS: Record<ChatProviderName, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4.1-mini',
  'openai-compatible': 'gpt-4.1-mini',
};

function normalizeProvider(value: string | undefined): ChatProviderName {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'openai-compatible') return 'openai-compatible';
  return 'anthropic';
}

function resolveApiKey(provider: ChatProviderName): string {
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  }
  return process.env.OPENAI_API_KEY?.trim() ?? process.env.AI_API_KEY?.trim() ?? '';
}

function resolveBaseUrl(provider: ChatProviderName, configuredBaseUrl?: string): string | undefined {
  if (configuredBaseUrl?.trim()) return configuredBaseUrl.trim();
  if (provider === 'openai') return 'https://api.openai.com/v1';
  return undefined;
}

export function getChatProviderSettings(): ChatProviderSettings {
  const chatConfig = config.features?.chat;
  const provider = normalizeProvider(chatConfig?.provider);
  const model = chatConfig?.model?.trim() || DEFAULT_MODELS[provider];
  const baseUrl = resolveBaseUrl(provider, chatConfig?.baseUrl);
  const apiKey = resolveApiKey(provider);

  if (!apiKey) {
    const expectedVar =
      provider === 'anthropic'
        ? 'ANTHROPIC_API_KEY'
        : provider === 'openai'
          ? 'OPENAI_API_KEY'
          : 'OPENAI_API_KEY or AI_API_KEY';
    throw new Error(`Missing API key for chat provider "${provider}". Expected ${expectedVar}.`);
  }

  if ((provider === 'openai' || provider === 'openai-compatible') && !baseUrl) {
    throw new Error(`Missing base URL for chat provider "${provider}". Set config.features.chat.baseUrl.`);
  }

  return {
    provider,
    model,
    baseUrl,
    apiKey,
  };
}

export function createChatProvider(settings: ChatProviderSettings): ChatProvider {
  switch (settings.provider) {
    case 'openai':
    case 'openai-compatible':
      return createOpenAICompatibleProvider(settings);
    case 'anthropic':
    default:
      return createAnthropicProvider(settings);
  }
}

function createAnthropicProvider(settings: ChatProviderSettings): ChatProvider {
  const client = new Anthropic({ apiKey: settings.apiKey });

  return {
    async *streamText(input: ChatProviderRequest) {
      const stream = client.messages.stream({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.systemPrompt,
        messages: input.messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    },
  };
}

function createOpenAICompatibleProvider(settings: ChatProviderSettings): ChatProvider {
  return {
    async *streamText(input: ChatProviderRequest) {
      const response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          stream: true,
          max_tokens: input.maxTokens,
          messages: [{ role: 'system', content: input.systemPrompt }, ...input.messages],
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`Provider request failed: ${response.status} ${message}`);
      }

      if (!response.body) {
        throw new Error('Provider response did not include a streaming body.');
      }

      yield* readOpenAICompatibleTextStream(response.body);
    },
  };
}

async function* readOpenAICompatibleTextStream(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const dataLines = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      for (const line of dataLines) {
        if (!line || line === '[DONE]') continue;

        let payload: unknown;
        try {
          payload = JSON.parse(line);
        } catch {
          continue;
        }

        const text = extractOpenAICompatibleDeltaText(payload);
        if (text) {
          yield text;
        }
      }
    }
  }
}

function extractOpenAICompatibleDeltaText(payload: unknown): string {
  const choice = (payload as { choices?: Array<{ delta?: { content?: unknown } }> })?.choices?.[0];
  const content = choice?.delta?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }

  return '';
}
