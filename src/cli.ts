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
  thinkfeel profiles
  thinkfeel use <profile>
  thinkfeel generate "message" [options]
  thinkfeel personify "raw response" [options]

Options:
  --api-key-env <name>   Environment variable that contains the ThinkFeel API key.
  --api-key-stdin        Read the ThinkFeel API key from stdin when using configure.
  --profile <name>       Saved profile. Defaults to THINKFEEL_PROFILE or the active profile.
  --persona-id <id>      ThinkFeel persona ID. Defaults to THINKFEEL_PERSONA_ID.
  --base-url <url>       API base URL. Defaults to THINKFEEL_BASE_URL or the SDK base URL.
  --name <name>           API key name when using login.
  --variations           Include reply variations and print JSON when using generate.
  --json                 Print the full API response as JSON.
  --show                 Show saved configuration when using configure.
  --clear                Delete saved configuration when using configure.
  -h, --help             Show this help message.`;

const setupGuidance =
  'Run "thinkfeel login", run "thinkfeel configure", or set THINKFEEL_API_KEY and THINKFEEL_PERSONA_ID.';
const commands = new Set(['configure', 'login', 'profiles', 'use', 'generate', 'personify']);
const defaultBaseUrl = 'https://playground.curvelabs.org';
const encryptedApiKeyVersion = 1;
const defaultProfileName = 'default';
const { subtle } = webcrypto;

type CliValues = Record<string, string | boolean | undefined>;
type ProfileConfig = { apiKey?: string; apiKeyEnv?: string; baseUrl?: string; personaId?: string };
type CliConfig = { version: 2; activeProfile: string; profiles: Record<string, ProfileConfig> };
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

function getBooleanOption(values: CliValues, kebabName: string, camelName: string) {
  return values[kebabName] === true || values[camelName] === true;
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

function normalizeProfileConfig(rawConfig: unknown): ProfileConfig {
  if (!rawConfig || typeof rawConfig !== 'object') return {};

  const config = rawConfig as ProfileConfig;
  return {
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : undefined,
    apiKeyEnv: typeof config.apiKeyEnv === 'string' ? config.apiKeyEnv : undefined,
    baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : undefined,
    personaId: typeof config.personaId === 'string' ? config.personaId : undefined,
  };
}

function normalizeProfileName(value: string | undefined) {
  const profileName = (value || defaultProfileName).trim();
  if (!profileName) throw new Error('Profile name is required.');
  if (!/^[A-Za-z0-9._-]+$/.test(profileName)) {
    throw new Error('Profile name can only contain letters, numbers, dots, underscores, and hyphens.');
  }

  return profileName;
}

function normalizeEnvName(value: string | undefined) {
  const envName = (value || '').trim();
  if (!envName) throw new Error('Environment variable name is required.');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) throw new Error(`Invalid environment variable name: ${envName}`);

  return envName;
}

function normalizeConfig(rawConfig: unknown): CliConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { version: 2, activeProfile: defaultProfileName, profiles: {} };
  }

  const config = rawConfig as Partial<CliConfig> & ProfileConfig;
  if (config.version === 2 && config.profiles && typeof config.profiles === 'object') {
    const profiles: Record<string, ProfileConfig> = {};

    for (const [profileNameRaw, profileConfigRaw] of Object.entries(config.profiles)) {
      const profileName = normalizeProfileName(profileNameRaw);
      profiles[profileName] = normalizeProfileConfig(profileConfigRaw);
    }

    return {
      version: 2,
      activeProfile: normalizeProfileName(config.activeProfile),
      profiles,
    };
  }

  const legacyProfile = normalizeProfileConfig(rawConfig);
  const hasLegacyConfig = Boolean(
    legacyProfile.apiKey || legacyProfile.apiKeyEnv || legacyProfile.baseUrl || legacyProfile.personaId
  );

  return {
    version: 2,
    activeProfile: defaultProfileName,
    profiles: hasLegacyConfig ? { [defaultProfileName]: legacyProfile } : {},
  };
}

async function readSavedConfig(): Promise<CliConfig> {
  const configPath = getConfigPath();

  try {
    return normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return normalizeConfig(null);

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

function resolveProfileName(values: CliValues, config: CliConfig) {
  const flagProfile = getStringOption(values, 'profile', 'profile');
  return normalizeProfileName(flagProfile ?? process.env.THINKFEEL_PROFILE ?? config.activeProfile ?? defaultProfileName);
}

function getProfileConfig(config: CliConfig, profileName: string) {
  return config.profiles[profileName] || {};
}

function setProfileConfig(config: CliConfig, profileName: string, profileConfig: ProfileConfig) {
  return {
    ...config,
    activeProfile: profileName,
    profiles: { ...config.profiles, [profileName]: profileConfig },
  };
}

function printConfig(config: CliConfig, profileName: string) {
  const profileConfig = getProfileConfig(config, profileName);

  console.log(`Config path: ${getConfigPath()}`);
  console.log(`Profile: ${profileName}${config.activeProfile === profileName ? ' (active)' : ''}`);
  console.log(`API key: ${maskSecret(profileConfig.apiKey)}`);
  console.log(`API key env: ${profileConfig.apiKeyEnv || '(not set)'}`);
  console.log(`Base URL: ${profileConfig.baseUrl || '(not set)'}`);
  console.log(`Persona ID: ${profileConfig.personaId || '(not set)'}`);
}

function printProfiles(config: CliConfig) {
  console.log(`Config path: ${getConfigPath()}`);

  const profileNames = Object.keys(config.profiles).sort();
  if (profileNames.length < 1) {
    console.log('(no profiles configured)');
    return;
  }

  for (const profileName of profileNames) {
    const profileConfig = config.profiles[profileName];
    const activeMarker = config.activeProfile === profileName ? '*' : ' ';
    console.log(
      `${activeMarker} ${profileName} apiKey=${maskSecret(profileConfig.apiKey)} apiKeyEnv=${
        profileConfig.apiKeyEnv || '(not set)'
      } baseUrl=${profileConfig.baseUrl || '(not set)'} personaId=${profileConfig.personaId || '(not set)'}`
    );
  }
}

function readStdin() {
  return new Promise<string>((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      text += chunk;
      if (text.length > 100_000) reject(new Error('stdin payload is too large.'));
    });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  });
}

function readEnvApiKey(envName: string, options?: { required?: boolean }) {
  const apiKey = process.env[envName]?.trim();
  if (apiKey) return apiKey;
  if (options?.required) throw new Error(`${envName} is not set.`);
  return undefined;
}

function ensureNoArgvApiKey(values: CliValues) {
  if (getStringOption(values, 'api-key', 'apiKey') === undefined) return;

  throw new Error(
    'Passing API keys with --api-key is not supported because argv can leak through shell history and process lists. Use "thinkfeel login", THINKFEEL_API_KEY, --api-key-env, or "thinkfeel configure --api-key-stdin".'
  );
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

async function openLoginUrl(url: string) {
  console.log(
    [
      'Logging in enables you to generate ThinkFeel API keys programmatically, save local profiles, and let coding agents use the CLI safely.',
      '',
      'Press Enter to login, or copy this URL:',
      url,
      '',
    ].join('\n')
  );

  if (process.stdin.isTTY && process.stdout.isTTY) await promptVisible('Press Enter to login');
  else console.log('Opening browser for ThinkFeel login...');

  openBrowser(url);
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

async function resolveRuntimeProfileConfig(values: CliValues): Promise<ProfileConfig> {
  const savedConfig = await readSavedConfig();
  const profileName = resolveProfileName(values, savedConfig);
  const profileConfig = getProfileConfig(savedConfig, profileName);
  const flagApiKeyEnvRaw = getStringOption(values, 'api-key-env', 'apiKeyEnv');
  const flagApiKeyEnv = flagApiKeyEnvRaw === undefined ? undefined : normalizeEnvName(flagApiKeyEnvRaw);
  const processApiKey = process.env.THINKFEEL_API_KEY?.trim();
  let apiKey = processApiKey || profileConfig.apiKey;

  if (flagApiKeyEnv) apiKey = readEnvApiKey(flagApiKeyEnv, { required: true });
  else if (!processApiKey && profileConfig.apiKeyEnv) apiKey = readEnvApiKey(profileConfig.apiKeyEnv, { required: true });

  return {
    apiKey,
    baseUrl: getStringOption(values, 'base-url', 'baseUrl') ?? process.env.THINKFEEL_BASE_URL ?? profileConfig.baseUrl,
    personaId:
      getStringOption(values, 'persona-id', 'personaId') ?? process.env.THINKFEEL_PERSONA_ID ?? profileConfig.personaId,
  };
}

async function configure(values: CliValues) {
  const savedConfig = await readSavedConfig();
  const profileName = resolveProfileName(values, savedConfig);

  if (values.clear) {
    if (getStringOption(values, 'profile', 'profile')) {
      const nextProfiles = { ...savedConfig.profiles };
      delete nextProfiles[profileName];

      if (Object.keys(nextProfiles).length < 1) {
        await clearSavedConfig();
        console.log(`Deleted ThinkFeel config at ${getConfigPath()}`);
        return;
      }

      const activeProfile =
        savedConfig.activeProfile === profileName ? Object.keys(nextProfiles).sort()[0] : savedConfig.activeProfile;
      await writeSavedConfig({ ...savedConfig, activeProfile, profiles: nextProfiles });
      console.log(`Deleted ThinkFeel profile "${profileName}" at ${getConfigPath()}`);
      return;
    }

    await clearSavedConfig();
    console.log(`Deleted ThinkFeel config at ${getConfigPath()}`);
    return;
  }

  if (values.show) {
    printConfig(savedConfig, profileName);
    return;
  }

  const savedProfile = getProfileConfig(savedConfig, profileName);
  const flagApiKeyEnv = getStringOption(values, 'api-key-env', 'apiKeyEnv');
  const shouldReadApiKeyFromStdin = getBooleanOption(values, 'api-key-stdin', 'apiKeyStdin');
  const flagBaseUrl = getStringOption(values, 'base-url', 'baseUrl');
  const flagPersonaId = getStringOption(values, 'persona-id', 'personaId');

  if (flagApiKeyEnv && shouldReadApiKeyFromStdin) throw new Error('Use either --api-key-env or --api-key-stdin, not both.');

  const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let apiKey = savedProfile.apiKey;
  let apiKeyEnv = savedProfile.apiKeyEnv;
  let baseUrl = flagBaseUrl ?? savedProfile.baseUrl;
  let personaId = flagPersonaId ?? savedProfile.personaId;

  if (flagApiKeyEnv !== undefined) {
    apiKeyEnv = normalizeEnvName(flagApiKeyEnv);
    apiKey = undefined;
  } else if (shouldReadApiKeyFromStdin) {
    if (process.stdin.isTTY) throw new Error('Pipe the API key to stdin when using --api-key-stdin.');
    apiKey = (await readStdin()).trim();
    apiKeyEnv = undefined;
  } else if (!apiKey && !apiKeyEnv && canPrompt) {
    apiKey = (await promptHidden('ThinkFeel API key: ')).trim();
  }

  if (!personaId && canPrompt) personaId = (await promptVisible('Default ThinkFeel persona ID: ')).trim();

  if (baseUrl === undefined && canPrompt) {
    baseUrl = (await promptVisible('Base URL (optional): ')).trim();
  }

  if (!apiKey && !apiKeyEnv) throw new Error('Missing API key. Use --api-key-env, --api-key-stdin, or thinkfeel login.');
  if (!personaId) throw new Error('Missing persona ID.');

  const nextProfile: ProfileConfig = { personaId };
  if (apiKey) nextProfile.apiKey = apiKey;
  if (apiKeyEnv) nextProfile.apiKeyEnv = apiKeyEnv;
  if (baseUrl) nextProfile.baseUrl = baseUrl;

  await writeSavedConfig(setProfileConfig(savedConfig, profileName, nextProfile));

  console.log(`Saved ThinkFeel profile "${profileName}" at ${getConfigPath()}`);
}

async function listProfiles() {
  printProfiles(await readSavedConfig());
}

async function useProfile(profileNameRaw: string | undefined) {
  const savedConfig = await readSavedConfig();
  const profileName = normalizeProfileName(profileNameRaw);
  if (!savedConfig.profiles[profileName]) throw new Error(`ThinkFeel profile "${profileName}" does not exist.`);

  await writeSavedConfig({ ...savedConfig, activeProfile: profileName });
  console.log(`Active ThinkFeel profile: ${profileName}`);
}

async function login(values: CliValues) {
  const savedConfig = await readSavedConfig();
  const profileName = resolveProfileName(values, savedConfig);
  const savedProfile = getProfileConfig(savedConfig, profileName);
  const flagBaseUrl = getStringOption(values, 'base-url', 'baseUrl');
  const flagPersonaId = getStringOption(values, 'persona-id', 'personaId');
  const keyName = getStringOption(values, 'name', 'name') ?? 'ThinkFeel CLI';
  const baseUrl = flagBaseUrl ?? process.env.THINKFEEL_BASE_URL ?? savedProfile.baseUrl ?? defaultBaseUrl;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const state = randomUUID();
  const keyPair = await generateRecipientKeyPair();
  const { callbackPromise, redirectUri } = await startLoginCallbackServer(state);
  const loginUrl = new URL('/api/thinkfeel/cli/login', normalizedBaseUrl);
  loginUrl.searchParams.set('state', state);
  loginUrl.searchParams.set('name', keyName);
  loginUrl.searchParams.set('source', 'cli');
  loginUrl.searchParams.set('redirect_uri', redirectUri);
  loginUrl.searchParams.set('recipient_public_key_jwk', base64urlJson(keyPair.publicJwk));

  await openLoginUrl(loginUrl.toString());

  const { encryptedApiKey } = await callbackPromise;
  const apiKey = await decryptEncryptedApiKey(keyPair.privateKey, encryptedApiKey);
  const nextProfile: ProfileConfig = { ...savedProfile, apiKey };
  delete nextProfile.apiKeyEnv;

  const personaId = flagPersonaId ?? process.env.THINKFEEL_PERSONA_ID ?? savedProfile.personaId;
  if (personaId) nextProfile.personaId = personaId;
  if (flagBaseUrl || savedProfile.baseUrl || process.env.THINKFEEL_BASE_URL) nextProfile.baseUrl = normalizedBaseUrl;

  await writeSavedConfig(setProfileConfig(savedConfig, profileName, nextProfile));
  console.log(`Saved ThinkFeel API key for profile "${profileName}" at ${getConfigPath()}`);
  if (!nextProfile.personaId) console.log('Run "thinkfeel configure" to set a default persona ID before generate/personify.');
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      apiKey: { type: 'string' },
      apiKeyEnv: { type: 'string' },
      apiKeyStdin: { type: 'boolean', default: false },
      baseUrl: { type: 'string' },
      'api-key': { type: 'string' },
      'api-key-env': { type: 'string' },
      'api-key-stdin': { type: 'boolean', default: false },
      name: { type: 'string' },
      personaId: { type: 'string' },
      'base-url': { type: 'string' },
      'persona-id': { type: 'string' },
      profile: { type: 'string' },
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

  ensureNoArgvApiKey(values);

  if (command === 'login') {
    await login(values);
    return;
  }

  if (!commands.has(command)) throw new Error(`Unknown command: ${command}.\n\n${usage}`);

  if (command === 'configure') {
    await configure(values);
    return;
  }

  if (command === 'profiles') {
    await listProfiles();
    return;
  }

  if (command === 'use') {
    await useProfile(positionals[1]);
    return;
  }

  const { apiKey, baseUrl, personaId } = await resolveRuntimeProfileConfig(values);
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
