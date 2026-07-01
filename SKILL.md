---
name: thinkfeel-sdk
description: Use when a coding agent needs to install, configure, or call the ThinkFeel SDK or CLI for generate/personify work.
---

# ThinkFeel SDK

Use this skill when a project needs ThinkFeel API access through `@curvelabs.org/thinkfeel` or the `thinkfeel` CLI.

## Rules

- Never ask the user to paste an API key into chat.
- Never print, quote, summarize, or inspect secret values from `.env*` or ThinkFeel config files.
- Prefer `thinkfeel login` for approved Playground users. It opens browser sign-in, creates a key, and stores it locally without printing plaintext.
- If `thinkfeel login` is unavailable, ask before using `thinkfeel configure` or editing an env file.
- Use `THINKFEEL_API_KEY`, `THINKFEEL_PERSONA_ID`, and `THINKFEEL_BASE_URL` only when the project already documents those env vars or the user explicitly requests env-based setup.

## Setup

1. Check whether the package is already installed:

```bash
npm ls @curvelabs.org/thinkfeel
```

2. If missing, install it with the package manager used by the project.

3. Configure auth:

```bash
npx thinkfeel login
```

If a project needs a default persona for CLI calls:

```bash
npx thinkfeel login --persona-id <persona_id>
```

4. Verify configuration without exposing secrets:

```bash
npx thinkfeel configure --show
```

5. Run the relevant command:

```bash
npx thinkfeel generate "Can we talk later?"
npx thinkfeel personify "Thanks for reaching out. Send me the details when you have them."
```

## SDK Usage

```typescript
import { ThinkFeel } from '@curvelabs.org/thinkfeel';

const thinkFeel = new ThinkFeel({
  apiKey: process.env.THINKFEEL_API_KEY!,
  personaId: process.env.THINKFEEL_PERSONA_ID!,
});

const response = await thinkFeel.generate({
  messages: [{ role: 'user', content: 'Can we talk later?' }],
});

console.log(response.finalReply);
```
