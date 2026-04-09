import { ThinkFeelConfig, GenerateOptions, GenerateResponse, ThinkFeelError } from './types';

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
    if (!config.apiKey) {
      throw new Error('apiKey is required');
    }
    if (!config.personaId) {
      throw new Error('personaId is required');
    }

    this.apiKey = config.apiKey;
    this.personaId = config.personaId;
    this.baseUrl = config.baseUrl || 'https://playground.curvelabs.org';
  }

  /**
   * Generate a response based on the conversation messages
   * @param options - Generation options
   * @returns Promise with the generated response
   */
  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    if (!options.messages || options.messages.length === 0) {
      throw new Error('messages array is required and must not be empty');
    }

    const lastMessage = options.messages[options.messages.length - 1];
    if (lastMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          personaId: this.personaId,
          messages: options.messages,
          includeVariations: options.includeVariations || false,
        }),
      });

      if (!response.ok) {
        let errorData: ThinkFeelError = {};
        try {
          errorData = (await response.json()) as ThinkFeelError;
        } catch {
          // If JSON parsing fails, use empty object
        }

        if (response.status === 429) {
          throw new Error(errorData.message || 'Rate limit exceeded or insufficient balance');
        }

        throw new Error(errorData.message || errorData.error || `API request failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        result?: {
          finalReply?: string;
          replyChoices?: string[];
        };
        status: string;
        rateLimits?: Array<{ limit: string; remaining: number }>;
      };

      return {
        finalReply: data.result?.finalReply || '',
        replyChoices: data.result?.replyChoices,
        status: data.status,
        rateLimits: data.rateLimits,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }
}
