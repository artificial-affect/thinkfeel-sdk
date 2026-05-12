import {
  ThinkFeelError,
  GenerateOptions,
  ThinkFeelConfig,
  GenerateResponse,
  PersonifyOptions,
  PersonifyResponse,
} from "./types";

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
    if (!config.apiKey) throw new Error("apiKey is required");
    if (!config.personaId) throw new Error("personaId is required");

    this.apiKey = config.apiKey;
    this.personaId = config.personaId;
    this.baseUrl = config.baseUrl || "https://playground.curvelabs.org";
  }

  /**
   * Generate a response based on the conversation messages
   * @param options - Generation options
   * @returns Promise with the generated response
   */
  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    if (!options.messages || options.messages.length === 0) {
      throw new Error("messages array is required and must not be empty");
    }

    const lastMessage = options.messages[options.messages.length - 1];
    if (lastMessage.role !== "user")
      throw new Error("Last message must be from user");

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/generate`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
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
          throw new Error(
            errorData.message || "Rate limit exceeded or insufficient balance",
          );
        }

        throw new Error(
          errorData.message ||
            errorData.error ||
            `API request failed with status ${response.status}`,
        );
      }

      const data = (await response.json()) as {
        status: string;
        rateLimits?: Array<{ limit: string; remaining: number }>;
        result?: {
          chunks?: string[];
          finalReply?: string;
          replyChoices?: string[];
        };
      };

      return {
        status: data.status,
        rateLimits: data.rateLimits,
        chunks: data.result?.chunks || [],
        replyChoices: data.result?.replyChoices,
        finalReply: data.result?.finalReply || "",
      };
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("An unexpected error occurred");
    }
  }

  /**
   * Personify a raw base response in the configured persona voice
   * @param options - Personification options
   * @returns Promise with the personified response
   */
  async personify(options: PersonifyOptions) {
    const isRawMissing = !options.raw || typeof options.raw !== "string";
    if (isRawMissing)
      throw new Error("raw string is required and must not be empty");

    const raw = options.raw.trim();
    if (!raw) throw new Error("raw string is required and must not be empty");

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/personify`, {
        method: "POST",
        body: JSON.stringify({
          raw,
          personaId: this.personaId,
        }),
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        let errorData: ThinkFeelError = {};
        try {
          errorData = (await response.json()) as ThinkFeelError;
        } catch {
          // If JSON parsing fails, use empty object
        }

        if (response.status === 429) {
          throw new Error(
            errorData.message || "Rate limit exceeded or insufficient balance",
          );
        }

        throw new Error(
          errorData.message ||
            errorData.error ||
            `API request failed with status ${response.status}`,
        );
      }

      const data = (await response.json()) as {
        chunks?: string[];
        personified?: string;
      };

      const personifyResponse: PersonifyResponse = {
        chunks: data.chunks || [],
        personified: data.personified || "",
      };

      return personifyResponse;
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("An unexpected error occurred");
    }
  }
}
