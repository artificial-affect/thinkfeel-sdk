export interface ThinkFeelConfig {
  apiKey: string;
  baseUrl?: string;
  personaId: string;
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
  status: string;
  chunks: string[];
  finalReply: string;
  replyChoices?: string[];
  rateLimits?: RateLimit[];
}

export interface PersonifyResponse {
  chunks: string[];
  personified: string;
}

export interface ThinkFeelError {
  error?: string;
  message?: string;
  balance?: number;
}
