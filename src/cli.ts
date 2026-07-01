#!/usr/bin/env node
import path from 'node:path';
import http from 'node:http';
import { ThinkFeel } from './client';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { homedir, platform } from 'node:os';
import { execFile } from 'node:child_process';
import { randomUUID, webcrypto } from 'node:crypto';
import { rm, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';

const usage = `Usage:
  thinkfeel configure [options]
  thinkfeel login [options]
  thinkfeel generate "message" [options]
  thinkfeel personify "raw response" [options]

Options:
  --api-key <key>        Curve API key. Defaults to THINKFEEL_API_KEY.
  --persona-id <id>      Curve persona ID. Defaults to THINKFEEL_PERSONA_ID.
  --base-url <url>       API base URL. Defaults to THINKFEEL_BASE_URL or the SDK base URL.
  --name <name>           API key name when using login.
  --variations           Include reply variations and print JSON when using generate.
  --json                 Print the full API response as JSON.
  --show                 Show saved configuration when using configure.
  --clear                Delete saved configuration when using configure.
  -h, --help             Show this help message.`;

const setupGuidance = 'Run "thinkfeel configure" or set THINKFEEL_API_KEY and THINKFEEL_PERSONA_ID.';
const commands = new Set(['configure', 'login', 'generate', 'personify']);
const defaultBaseUrl = 'https://playground.curvelabs.org';
const encryptedApiKeyVersion = 1;
const { subtle } = webcrypto;

type CliValues = Record<string, string | boolean | undefined>;
type CliConfig = { apiKey?: string; baseUrl?: string; personaId?: string };
type EncryptedApiKey = { ciphertext?: unknown; version?: unknown };
type CryptoKey = webcrypto.CryptoKey;
type JsonWebKey = webcrypto.JsonWebKey;

function getStringOption(values: CliValues, kebabName: string, camelName: string) {
  const kebabValue = values[kebabName];
  if (typeof kebabValue === 'string') return kebabValue;

  const camelValue = values[camelName];
  if (typeof camelValue === 'string') return camelValue;

  return undefined;
}

function getConfigDir() {
  const override = process.env.THINKFEEL_CONFIG_DIR?.trim();
  if (override) return override;

  const home = homedir();
  if (!home) throw new Error('Unable to determine home directory.');

  if (platform() === 'darwin') return path.join(home, 'Library', 'Application Support', 'thinkfeel');
  if (platform() === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'thinkfeel');

  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'thinkfeel');
}

const getConfigPath = () => path.join(getConfigDir(), 'config.json');
const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error && 'code' in error;

function normalizeConfig(rawConfig: unknown): CliConfig {
  if (!rawConfig || typeof rawConfig !== 'object') return {};

  const config = rawConfig as CliConfig;
  return {
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : undefined,
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : undefined,
    personaId: typeof config.personaId === 'string' ? config.personaId : undefined,
  };
}

async function readSavedConfig(): Promise<CliConfig> {
  const configPath = getConfigPath();

  try {
    return normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return {};

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid ThinkFeel config at ${configPath}. Run "thinkfeel configure --clear" and configure it again.`);
    }

    throw error;
  }
}

async function writeSavedConfig(config: CliConfig) {
  const configDir = getConfigDir();
  const configPath = getConfigPath();
  const configJson = `${JSON.stringify(config, null, 2)}\n`;

  await mkdir(configDir, { mode: 0o700, recursive: true });
  await writeFile(configPath, configJson, { mode: 0o600 });

  try {
    await chmod(configDir, 0o700);
    await chmod(configPath, 0o600);
  } catch {
    // Some filesystems do not support POSIX permissions.
  }
}

const clearSavedConfig = async () => await rm(getConfigPath(), { force: true });

function maskSecret(secret: string | undefined) {
  if (!secret) return '(not set)';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function printConfig(config: CliConfig) {
  console.log(`Config path: ${getConfigPath()}`);
  console.log(`API key: ${maskSecret(config.apiKey)}`);
  console.log(`Base URL: ${config.baseUrl || '(not set)'}`);
  console.log(`Persona ID: ${config.personaId || '(not set)'}`);
}

function promptVisible(question: string) {
  return new Promise<string>(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptHidden(question: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return promptVisible(question);

  return new Promise<string>((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    let answer = '';
    const wasRaw = stdin.isRaw;

    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    function onData(buffer: Buffer) {
      const text = buffer.toString('utf8');

      for (const char of text) {
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Configuration cancelled.'));
          return;
        }

        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');

          resolve(answer);
          return;
        }

        if (char === '\u007f' || char === '\b') {
          answer = answer.slice(0, -1);
          continue;
        }

        answer += char;
      }
    }

    stdout.write(question);
    stdin.setRawMode(true);

    stdin.resume();
    stdin.on('data', onData);
  });
}

function requireInput(command: string, input: string) {
  if (!input.trim()) throw new Error(`Missing input for "${command}".\n\n${usage}`);
}

function formatChunks(chunks: string[], fallback: string) {
  if (chunks.length > 0) return chunks.join('\n');
  return fallback;
}

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function base64urlToBytes(value: string) {
  return Buffer.from(value, 'base64url');
}

function minimalPublicJwk(publicJwk: JsonWebKey) {
  if (publicJwk.kty !== 'RSA' || !publicJwk.n || !publicJwk.e) {
    throw new Error('Generated keypair did not produce an RSA public JWK.');
  }

  return { e: publicJwk.e, kty: 'RSA', n: publicJwk.n };
}

async function generateRecipientKeyPair() {
  const keyPair = await subtle.generateKey(
    {
      hash: 'SHA-256',
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicJwk = minimalPublicJwk(await subtle.exportKey('jwk', keyPair.publicKey));
  return { privateKey: keyPair.privateKey, publicJwk };
}

async function decryptEncryptedApiKey(privateKey: CryptoKey, encryptedApiKey: EncryptedApiKey) {
  if (encryptedApiKey.version !== encryptedApiKeyVersion) throw new Error('Unsupported encrypted API key version.');
  if (typeof encryptedApiKey.ciphertext !== 'string') throw new Error('Missing encrypted API key ciphertext.');

  const plaintext = await subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64urlToBytes(encryptedApiKey.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

function openBrowser(url: string) {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];

  execFile(command, args, error => {
    if (error) console.log(`Open this URL in your browser:\n${url}`);
  });
}

function readRequestBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error('Login callback payload is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function startLoginCallbackServer(state: string) {
  let resolveCallback = (_value: { encryptedApiKey: EncryptedApiKey }) => {};
  let rejectCallback = (_reason?: unknown) => {};
  const callbackPromise = new Promise<{ encryptedApiKey: EncryptedApiKey }>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const serverReady = new Promise<{ callbackPromise: Promise<{ encryptedApiKey: EncryptedApiKey }>; redirectUri: string }>(
    (resolve, reject) => {
      const server = http.createServer(async (request, response) => {
        try {
          if (request.method !== 'POST' || request.url !== '/thinkfeel/callback') {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end('Not found');
            return;
          }

          const form = new URLSearchParams(await readRequestBody(request));
          if (form.get('state') !== state) throw new Error('Invalid login callback state.');

          const encryptedApiKeyRaw = form.get('encrypted_api_key');
          if (!encryptedApiKeyRaw) throw new Error('Missing encrypted API key.');

          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(
            '<!doctype html><title>ThinkFeel Login</title><p>ThinkFeel CLI login complete. You can close this tab.</p>'
          );
          server.close();
          resolveCallback({ encryptedApiKey: JSON.parse(encryptedApiKeyRaw) as EncryptedApiKey });
        } catch (error) {
          response.writeHead(400, { 'Content-Type': 'text/plain' });
          response.end(error instanceof Error ? error.message : String(error));
          server.close();
          rejectCallback(error);
        }
      });

      const timeout = setTimeout(() => {
        server.close();
        rejectCallback(new Error('Timed out waiting for browser login.'));
      }, 5 * 60 * 1000);

      server.on('close', () => clearTimeout(timeout));
      server.on('error', error => {
        reject(error);
        rejectCallback(error);
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          const error = new Error('Failed to start local login callback.');
          reject(error);
          rejectCallback(error);
          return;
        }

        resolve({ callbackPromise, redirectUri: `http://127.0.0.1:${address.port}/thinkfeel/callback` });
      });
    }
  );

  return serverReady;
}

async function resolveRuntimeConfig(values: CliValues): Promise<CliConfig> {
  const savedConfig = await readSavedConfig();

  return {
    apiKey: getStringOption(values, 'api-key', 'apiKey') ?? process.env.THINKFEEL_API_KEY ?? savedConfig.apiKey,
    baseUrl: getStringOption(values, 'base-url', 'baseUrl') ?? process.env.THINKFEEL_BASE_URL ?? savedConfig.baseUrl,
    personaId:
      getStringOption(values, 'persona-id', 'personaId') ?? process.env.THINKFEEL_PERSONA_ID ?? savedConfig.personaId,
  };
}

async function configure(values: CliValues) {
  if (values.clear) {
    await clearSavedConfig();
    console.log(`Deleted ThinkFeel config at ${getConfigPath()}`);
    return;
  }

  const savedConfig = await readSavedConfig();

  if (values.show) {
    printConfig(savedConfig);
    return;
  }

  const flagApiKey = getStringOption(values, 'api-key', 'apiKey');
  const flagBaseUrl = getStringOption(values, 'base-url', 'baseUrl');
  const flagPersonaId = getStringOption(values, 'persona-id', 'personaId');

  const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const hasRequiredFlags = Boolean(flagApiKey && flagPersonaId);

  let apiKey = flagApiKey;
  let baseUrl = flagBaseUrl;
  let personaId = flagPersonaId;

  if (!apiKey && canPrompt) apiKey = (await promptHidden('Curve API key: ')).trim();
  if (!personaId && canPrompt) personaId = (await promptVisible('Default ThinkFeel persona ID: ')).trim();

  if (baseUrl === undefined && canPrompt && !hasRequiredFlags) {
    baseUrl = (await promptVisible('Base URL (optional): ')).trim();
  }

  if (!apiKey) throw new Error('Missing API key.');
  if (!personaId) throw new Error('Missing persona ID.');

  const nextConfig: CliConfig = { apiKey, personaId };
  if (baseUrl) nextConfig.baseUrl = baseUrl;
  await writeSavedConfig(nextConfig);

  console.log(`Saved ThinkFeel config at ${getConfigPath()}`);
}

async function login(values: CliValues) {
  const savedConfig = await readSavedConfig();
  const flagBaseUrl = getStringOption(values, 'base-url', 'baseUrl');
  const flagPersonaId = getStringOption(values, 'persona-id', 'personaId');
  const keyName = getStringOption(values, 'name', 'name') ?? 'ThinkFeel CLI';
  const baseUrl = flagBaseUrl ?? process.env.THINKFEEL_BASE_URL ?? savedConfig.baseUrl ?? defaultBaseUrl;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const state = randomUUID();
  const keyPair = await generateRecipientKeyPair();
  const { callbackPromise, redirectUri } = await startLoginCallbackServer(state);
  const loginUrl = new URL('/api/thinkfeel/cli/login', normalizedBaseUrl);
  loginUrl.searchParams.set('state', state);
  loginUrl.searchParams.set('name', keyName);
  loginUrl.searchParams.set('source', 'codex');
  loginUrl.searchParams.set('redirect_uri', redirectUri);
  loginUrl.searchParams.set('recipient_public_key_jwk', base64urlJson(keyPair.publicJwk));

  console.log('Opening browser for ThinkFeel login...');
  openBrowser(loginUrl.toString());

  const { encryptedApiKey } = await callbackPromise;
  const apiKey = await decryptEncryptedApiKey(keyPair.privateKey, encryptedApiKey);
  const nextConfig: CliConfig = { ...savedConfig, apiKey };
  const personaId = flagPersonaId ?? process.env.THINKFEEL_PERSONA_ID ?? savedConfig.personaId;
  if (personaId) nextConfig.personaId = personaId;
  if (flagBaseUrl || savedConfig.baseUrl || process.env.THINKFEEL_BASE_URL) nextConfig.baseUrl = normalizedBaseUrl;

  await writeSavedConfig(nextConfig);
  console.log(`Saved ThinkFeel API key at ${getConfigPath()}`);
  if (!nextConfig.personaId) console.log('Run "thinkfeel configure" to set a default persona ID before generate/personify.');
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      apiKey: { type: 'string' },
      baseUrl: { type: 'string' },
      'api-key': { type: 'string' },
      name: { type: 'string' },
      personaId: { type: 'string' },
      'base-url': { type: 'string' },
      'persona-id': { type: 'string' },
      json: { type: 'boolean', default: false },
      show: { type: 'boolean', default: false },
      clear: { type: 'boolean', default: false },
      variations: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const command = positionals[0];

  if (!command || command === 'help' || values.help) {
    console.log(usage);
    return;
  }

  if (command === 'login') {
    await login(values);
    return;
  }

  if (!commands.has(command)) throw new Error(`Unknown command: ${command}.\n\n${usage}`);

  if (command === 'configure') {
    await configure(values);
    return;
  }

  const { apiKey, baseUrl, personaId } = await resolveRuntimeConfig(values);
  if (!apiKey || !personaId) throw new Error(setupGuidance);

  const thinkFeel = new ThinkFeel({ apiKey, baseUrl, personaId });
  const input = positionals.slice(1).join(' ');

  if (command === 'generate') {
    requireInput(command, input);

    const response = await thinkFeel.generate({
      messages: [{ role: 'user', content: input }],
      includeVariations: Boolean(values.variations),
    });

    const shouldPrintJson = Boolean(values.json || values.variations);
    console.log(shouldPrintJson ? JSON.stringify(response, null, 2) : formatChunks(response.chunks, response.finalReply));
    return;
  }

  if (command === 'personify') {
    requireInput(command, input);
    const response = await thinkFeel.personify({ raw: input });
    console.log(values.json ? JSON.stringify(response, null, 2) : formatChunks(response.chunks, response.personified));
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`thinkfeel: ${message}`);
  process.exitCode = 1;
});
