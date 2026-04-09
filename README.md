# @curvelabs.org/thinkfeel

Official TypeScript/JavaScript SDK for the Curve ThinkFeel API - Generate realistic, human-like responses with AI personas.

## Installation

```bash
npm install @curvelabs.org/thinkfeel
```

## Quick Start

```typescript
import { ThinkFeel } from '@curvelabs.org/thinkfeel';

const thinkFeel = new ThinkFeel({
  apiKey: 'YOUR_CURVE_API_KEY',
  personaId: 'YOUR_CURVE_PERSONA_ID',
});

const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'hey :)' }],
  includeVariations: true,
});

console.log(response.finalReply);
// => "hey! what's up?"

console.log(response.replyChoices);
// => [
//   "hey! what's up?",
//   "hi, how's it going",
//   "sup. good to hear from you"
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
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.finalReply);
```

#### With Conversation History

```typescript
const response = await thinkFeel.generate({
  messages: [
    { role: 'user', content: "What's your favorite color?" },
    { role: 'assistant', content: 'I love blue!' },
    { role: 'user', content: 'Why blue?' },
  ],
});

console.log(response.finalReply);
```

#### With Multiple Variations

```typescript
const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'How are you?' }],
  includeVariations: true,
});

console.log(response.finalReply); // The selected best reply
console.log(response.replyChoices); // Array of all variations
```

### Check Rate Limits

```typescript
const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'Hi!' }],
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
- `replyChoices` (string[], optional): Array of reply variations (only if `includeVariations` is true)
- `status` (string): Generation status
- `rateLimits` (RateLimit[], optional): Rate limit information

## Types

### `Message`

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
}
```

### `GenerateResponse`

```typescript
interface GenerateResponse {
  finalReply: string;
  replyChoices?: string[];
  status: string;
  rateLimits?: RateLimit[];
}
```

### `RateLimit`

```typescript
interface RateLimit {
  limit: string;
  remaining: number;
}
```

## Error Handling

```typescript
try {
  const response = await thinkFeel.generate({
    messages: [{ role: 'user', content: 'Hello!' }],
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
