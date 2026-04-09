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
   * Base URL for the API (optional, defaults to production)
   */
  baseUrl?: string;
}

/**
 * A message in the conversation
 */
export interface Message {
  /**
   * The role of the message sender
   */
  role: 'user' | 'assistant';

  /**
   * The content of the message
   */
  content: string;
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
  remaining: number;
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
 * Error response from the API
 */
export interface ThinkFeelError {
  error?: string;
  message?: string;
  balance?: number;
}
