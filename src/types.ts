export interface ThinkFeelConfig {
  apiKey: string;

  personaId: string;

  baseUrl?: string;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'developer';

export interface MessageTextPart {
  type: 'text';
  text: string;
}

export type MessageContent = string | MessageTextPart[];

export interface Message {
  role: MessageRole;

  content: MessageContent;

  timestamp?: number | string;

  createdAt?: number | string;

  created_at?: number | string;
}

export interface GenerateOptions {
  messages: Message[];

  includeVariations?: boolean;
}

export interface PersonifyOptions {
  raw: string;
}

export interface RateLimit {
  limit: string;

  remaining: number | null;
}

export interface GenerateResponse {
  finalReply: string;

  chunks: string[];

  replyChoices?: string[];

  status: string;

  rateLimits?: RateLimit[];
}

export interface PersonifyResponse {
  personified: string;

  chunks: string[];
}

export interface ThinkFeelError {
  error?: string;
  message?: string;
  balance?: number;
}
