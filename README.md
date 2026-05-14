# @curvelabs.org/thinkfeel

Official TypeScript/JavaScript SDK for the Curve ThinkFeel API - generate persona-aware conversational responses and rewrites.

## Installation

```bash
npm install @curvelabs.org/thinkfeel
```

## CLI

The package also installs a `thinkfeel` command. After installing:

```bash
npx thinkfeel configure
npx thinkfeel generate "I just got back from a long day and wanted to check in."
npx thinkfeel generate "I just got back from a long day and wanted to check in." --variations
npx thinkfeel personify "Thanks for reaching out. I can help with that. Send me the details when you have them."
```

`--variations` prints the full JSON response automatically so `replyChoices` are visible.

For one-off usage without installing first:

```bash
npx --package @curvelabs.org/thinkfeel thinkfeel configure
```

For non-interactive setup:

```bash
npx thinkfeel configure --api-key YOUR_CURVE_API_KEY --persona-id YOUR_CURVE_PERSONA_ID
```

To inspect or remove saved CLI configuration:

```bash
npx thinkfeel configure --show
npx thinkfeel configure --clear
```

You can also override saved configuration with environment variables or flags:

```bash
THINKFEEL_API_KEY="YOUR_CURVE_API_KEY" THINKFEEL_PERSONA_ID="YOUR_CURVE_PERSONA_ID" npx thinkfeel generate "Can we talk later?"
npx thinkfeel generate "Can we talk later?" --api-key YOUR_CURVE_API_KEY --persona-id YOUR_CURVE_PERSONA_ID
```

## Contributor Tests

From a cloned repo, tests require real API config.

```bash
THINKFEEL_API_KEY="YOUR_CURVE_API_KEY" \
THINKFEEL_PERSONA_ID="YOUR_CURVE_PERSONA_ID" \
THINKFEEL_BASE_URL="https://playground.curvelabs.org" \
npm test
```

`npm test` builds, calls the live SDK, packs and installs the package in a temp project, then tests the installed CLI.

Local env file:

```bash
cp .env.local.example .env.local
npm test
```

Optional:

```bash
THINKFEEL_GENERATE_PROMPT="Can we talk later?"
THINKFEEL_PERSONIFY_RAW="Thanks for reaching out. Send me the details when you have them."
```

## Quick Start

```typescript
import { ThinkFeel } from '@curvelabs.org/thinkfeel';

const thinkFeel = new ThinkFeel({
  apiKey: 'YOUR_CURVE_API_KEY',
  personaId: 'YOUR_CURVE_PERSONA_ID',
});

const response = await thinkFeel.generate({
  messages: [
    {
      role: 'user',
      content: 'I just got back from a long day and wanted to check in.',
    },
  ],
  includeVariations: true,
});

console.log(response.finalReply);
// => "I'm here. Want to tell me what happened?"

console.log(response.chunks);
// => ["I'm here.", "Want to tell me what happened?"]

console.log(response.replyChoices);
// => [
//   "I'm here. Want to tell me what happened?",
//   "Long day? Tell me everything.",
//   "Of course. What happened?"
// ]
```

## Usage

### Initialize the Client

```typescript
import { ThinkFeel } from '@curvelabs.org/thinkfeel';

const thinkFeel = new ThinkFeel({
  apiKey: 'your-api-key',
  personaId: 'your-persona-id',
  // Optional: specify a custom base URL
  // baseUrl: "https://custom-domain.com"
});
```

### Generate a Response

#### Simple Generation

```typescript
const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'Can we talk later?' }],
});

console.log(response.finalReply);
console.log(response.chunks);
```

#### With Conversation History

```typescript
const response = await thinkFeel.generate({
  messages: [
    { role: 'user', content: "What's your favorite color?" },
    { role: 'assistant', content: 'I love blue!' },
    { role: 'user', content: 'Does it remind you of anything?' },
  ],
});

console.log(response.finalReply);
console.log(response.chunks);
```

#### With System Context

The API accepts `user`, `assistant`, `system`, and `developer` roles. The final message must be from `user`.

```typescript
const response = await thinkFeel.generate({
  messages: [
    { role: 'system', content: 'Keep the reply concise.' },
    { role: 'user', content: 'Can we talk later?' },
  ],
});

console.log(response.finalReply);
```

#### With Multiple Variations

```typescript
const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'What should we do this weekend?' }],
  includeVariations: true,
});

console.log(response.finalReply); // The selected best reply
console.log(response.chunks); // Message-ready chunks for display or chat delivery
console.log(response.replyChoices); // Array of all variations
```

### Personify Text

Personify rewrites an existing base response in the configured persona voice.

```typescript
const personified = await thinkFeel.personify({
  raw: 'Thanks for reaching out. I can help with that. Send me the details when you have them.',
});

console.log(personified.personified);
console.log(personified.chunks);
```

### Check Rate Limits

```typescript
const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'Are you around?' }],
});

console.log(response.rateLimits);
// => [
//   { limit: "requests_per_minute", remaining: 58 },
//   { limit: "requests_per_day", remaining: 998 }
// ]
```

## API Reference

### `ThinkFeel`

The main SDK client class.

#### Constructor

```typescript
new ThinkFeel(config: ThinkFeelConfig)
```

**Parameters:**

- `config.apiKey` (string, required): Your Curve API key
- `config.personaId` (string, required): The persona ID to use
- `config.baseUrl` (string, optional): Custom API base URL (defaults to `https://playground.curvelabs.org`)

#### Methods

##### `generate(options: GenerateOptions): Promise<GenerateResponse>`

Generate a response based on conversation messages.

**Parameters:**

- `options.messages` (Message[], required): Array of conversation messages
- `options.includeVariations` (boolean, optional): Whether to include multiple reply variations (default: false)

**Returns:** Promise<GenerateResponse>

- `finalReply` (string): The selected best reply
- `chunks` (string[]): The selected best reply split into message-ready chunks
- `replyChoices` (string[], optional): Array of reply variations (only if `includeVariations` is true)
- `status` (string): Generation status
- `rateLimits` (RateLimit[], optional): Rate limit information

##### `personify(options: PersonifyOptions): Promise<PersonifyResponse>`

Rewrite an existing base response in the configured persona voice.

**Parameters:**

- `options.raw` (string, required): Raw base response text to rewrite

**Returns:** Promise<PersonifyResponse>

- `personified` (string): The rewritten response
- `chunks` (string[]): The rewritten response split into message-ready chunks

## Endpoint Contracts

The SDK methods map directly to the public V1 endpoints.
This SDK covers `/api/v1/generate` and `/api/v1/personify`; it does not wrap the OpenAI-compatible `/api/v1/completions` endpoint.

### `POST /api/v1/generate`

Request body:

```json
{
  "personaId": "YOUR_CURVE_PERSONA_ID",
  "messages": [{ "role": "user", "content": "Can we talk later?" }],
  "includeVariations": false
}
```

Response body:

```json
{
  "status": "success",
  "rateLimits": [{ "limit": "requests_per_day", "remaining": 998 }],
  "result": {
    "finalReply": "Of course. Later works.",
    "chunks": ["Of course.", "Later works."]
  }
}
```

When `includeVariations` is `true`, `result.replyChoices` is included when the API returns variations.

### `POST /api/v1/personify`

Request body:

```json
{
  "personaId": "YOUR_CURVE_PERSONA_ID",
  "raw": "Thanks for reaching out. Send me the details when you have them."
}
```

Response body:

```json
{
  "personified": "Yeah, send me the details when you have them.",
  "chunks": ["Yeah, send me the details when you have them."]
}
```

## Types

### `Message`

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'developer';

interface MessageTextPart {
  type: 'text';
  text: string;
}

type MessageContent = string | MessageTextPart[];

interface Message {
  role: MessageRole;
  content: MessageContent;
  timestamp?: number | string;
  createdAt?: number | string;
  created_at?: number | string;
}
```

### `GenerateResponse`

```typescript
interface GenerateResponse {
  finalReply: string;
  chunks: string[];
  replyChoices?: string[];
  status: string;
  rateLimits?: RateLimit[];
}
```

### `PersonifyOptions`

```typescript
interface PersonifyOptions {
  raw: string;
}
```

### `PersonifyResponse`

```typescript
interface PersonifyResponse {
  personified: string;
  chunks: string[];
}
```

### `RateLimit`

```typescript
interface RateLimit {
  limit: string;
  remaining: number | null;
}
```

## Error Handling

```typescript
try {
  const response = await thinkFeel.generate({
    messages: [{ role: 'user', content: 'Can we talk later?' }],
  });
  console.log(response.finalReply);
} catch (error) {
  if (error instanceof Error) {
    console.error('Error:', error.message);
  }
}
```

Common errors:

- **401 Unauthorized**: Invalid API key
- **403 Forbidden**: API key not associated with an active billing account
- **404 Not Found**: Invalid persona ID
- **422 Unprocessable Entity**: Invalid request format
- **429 Too Many Requests**: Rate limit exceeded or insufficient balance

## Support

For support, visit [curvelabs.org/support](https://curvelabs.org/support)

## License

MIT
