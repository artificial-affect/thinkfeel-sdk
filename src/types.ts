/**
 * Configuration options for initializing the ThinkFeel SDK
 */
export interface ThinkFeelConfig {
  /**
   * Your Curve API key
   */
  apiKey: string;

  /**
   * The persona ID to use for generating responses
   */
  personaId: string;

  /**
   * Base URL for the API (optional, defaults to the SDK base URL)
   */
  baseUrl?: string;
}

/**
 * Role accepted by the V1 generate endpoint
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'developer';

/**
 * OpenAI-style text message part accepted by the V1 generate endpoint
 */
export interface MessageTextPart {
  type: 'text';
  text: string;
}

/**
 * Message content accepted by the V1 generate endpoint
 */
export type MessageContent = string | MessageTextPart[];

/**
 * A message in the conversation
 */
export interface Message {
  /**
   * The role of the message sender
   */
  role: MessageRole;

  /**
   * The content of the message
   */
  content: MessageContent;

  /**
   * Optional message timestamp. Seconds, milliseconds, and date strings are accepted.
   */
  timestamp?: number | string;

  /**
   * Optional camelCase timestamp alias accepted by the API.
   */
  createdAt?: number | string;

  /**
   * Optional snake_case timestamp alias accepted by the API.
   */
  created_at?: number | string;
}

/**
 * Options for generating a response
 */
export interface GenerateOptions {
  /**
   * Array of messages in the conversation
   */
  messages: Message[];

  /**
   * Whether to include multiple reply variations (default: false)
   */
  includeVariations?: boolean;
}

/**
 * Options for personifying a raw base response
 */
export interface PersonifyOptions {
  /**
   * Raw base response text to rewrite in the configured persona voice
   */
  raw: string;
}

/**
 * Rate limit information
 */
export interface RateLimit {
  /**
   * The name of the rate limit
   */
  limit: string;

  /**
   * Remaining requests for this limit
   */
  remaining: number | null;
}

/**
 * Response from the generate API
 */
export interface GenerateResponse {
  /**
   * The final selected reply
   */
  finalReply: string;

  /**
   * Final reply split into message-ready chunks
   */
  chunks: string[];

  /**
   * Array of reply variations (only included if includeVariations is true)
   */
  replyChoices?: string[];

  /**
   * Status of the generation
   */
  status: string;

  /**
   * Rate limit information
   */
  rateLimits?: RateLimit[];
}

/**
 * Response from the personify API
 */
export interface PersonifyResponse {
  /**
   * The raw response rewritten in the configured persona voice
   */
  personified: string;

  /**
   * Personified response split into message-ready chunks
   */
  chunks: string[];
}

/**
 * Error response from the API
 */
export interface ThinkFeelError {
  error?: string;
  message?: string;
  balance?: number;
}
