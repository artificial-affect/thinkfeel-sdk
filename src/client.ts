import {
  Message,
  ThinkFeelError,
  GenerateOptions,
  ThinkFeelConfig,
  GenerateResponse,
  PersonifyOptions,
  PersonifyResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://playground.curvelabs.org';
const MESSAGE_ROLES = new Set(['user', 'assistant', 'system', 'developer']);

type GenerateApiResponse = {
  status: string;
  rateLimits?: GenerateResponse['rateLimits'];
  result?: { chunks?: string[]; finalReply?: string; replyChoices?: string[] };
};

type PersonifyApiResponse = { chunks?: string[]; personified?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requireText(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required and must not be empty`);
  return value.trim();
}

function normalizeBaseUrl(baseUrl: string | undefined) {
  if (!baseUrl) return DEFAULT_BASE_URL;

  const trimmed = baseUrl.trim();
  if (!trimmed) return DEFAULT_BASE_URL;

  return trimmed.replace(/\/+$/, '');
}

function normalizeRole(role: unknown) {
  if (typeof role !== 'string') return '';
  return role.toLowerCase();
}

function validateMessageContent(content: unknown, messageIndex: number) {
  if (content === null || content === undefined || typeof content === 'string') return;

  if (!Array.isArray(content)) {
    throw new Error(`messages[${messageIndex}].content must be a string or an array of text parts`);
  }

  content.forEach((part, partIndex) => {
    if (!isRecord(part)) throw new Error(`messages[${messageIndex}].content[${partIndex}] must be an object`);
    if (part.type !== 'text') throw new Error(`messages[${messageIndex}].content[${partIndex}].type must be "text"`);

    if (typeof part.text !== 'string') {
      throw new Error(`messages[${messageIndex}].content[${partIndex}].text must be a string`);
    }
  });
}

function validateMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array is required and must not be empty');
  }

  messages.forEach((message, index) => {
    if (!isRecord(message)) throw new Error(`messages[${index}] must be an object`);

    const role = normalizeRole(message.role);
    if (!MESSAGE_ROLES.has(role)) throw new Error(`messages[${index}].role must be user, assistant, system, or developer`);

    validateMessageContent(message.content, index);
  });

  const lastMessage = messages[messages.length - 1] as Record<string, unknown>;
  if (normalizeRole(lastMessage.role) !== 'user') throw new Error('Last message must be from user');

  return messages as Message[];
}

async function readApiError(response: Response) {
  const fallback = `API request failed with status ${response.status}`;
  const text = await response.text();
  if (!text) return fallback;

  try {
    const errorData = JSON.parse(text) as ThinkFeelError;

    if (typeof errorData.message === 'string' && errorData.message) {
      return errorData.message;
    }

    if (typeof errorData.error === 'string' && errorData.error) {
      return errorData.error;
    }
  } catch {
    return text;
  }

  return fallback;
}

/**
 * ThinkFeel SDK Client
 */
export class ThinkFeel {
  private apiKey: string;
  private personaId: string;
  private baseUrl: string;

  /**
   * Initialize a new ThinkFeel client
   * @param config - Configuration options
   */
  constructor(config: ThinkFeelConfig) {
    if (!isRecord(config)) throw new Error('config object is required');

    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = requireText(config.apiKey, 'apiKey');
    this.personaId = requireText(config.personaId, 'personaId');
  }

  private async postJson<ResponseBody>(path: string, body: unknown): Promise<ResponseBody> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    return (await response.json()) as ResponseBody;
  }

  /**
   * Generate a response based on the conversation messages
   * @param options - Generation options
   * @returns Promise with the generated response
   */
  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    if (!isRecord(options)) throw new Error('options object is required');

    const messages = validateMessages(options.messages);

    if (options.includeVariations !== undefined && typeof options.includeVariations !== 'boolean') {
      throw new Error('includeVariations must be a boolean');
    }

    try {
      const data = await this.postJson<GenerateApiResponse>('/api/v1/generate', {
        messages,
        personaId: this.personaId,
        includeVariations: options.includeVariations === true,
      });

      return {
        status: data.status,
        rateLimits: data.rateLimits,
        chunks: data.result?.chunks || [],
        replyChoices: data.result?.replyChoices,
        finalReply: data.result?.finalReply || '',
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('An unexpected error occurred');
    }
  }

  /**
   * Personify a raw base response in the configured persona voice
   * @param options - Personification options
   * @returns Promise with the personified response
   */
  async personify(options: PersonifyOptions): Promise<PersonifyResponse> {
    if (!isRecord(options)) throw new Error('options object is required');

    const raw = requireText(options.raw, 'raw string');

    try {
      const data = await this.postJson<PersonifyApiResponse>('/api/v1/personify', { raw, personaId: this.personaId });

      return {
        chunks: data.chunks || [],
        personified: data.personified || '',
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('An unexpected error occurred');
    }
  }
}
