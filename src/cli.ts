#!/usr/bin/env node
import path from "node:path";
import { ThinkFeel } from "./client";
import readline from "node:readline";
import { parseArgs } from "node:util";
import { homedir, platform } from "node:os";
import { rm, chmod, mkdir, readFile, writeFile } from "node:fs/promises";

const usage = `Usage:
  thinkfeel configure [options]
  thinkfeel generate "message" [options]
  thinkfeel personify "raw response" [options]

Options:
  --api-key <key>        Curve API key. Defaults to THINKFEEL_API_KEY.
  --persona-id <id>      Curve persona ID. Defaults to THINKFEEL_PERSONA_ID.
  --base-url <url>       API base URL. Defaults to THINKFEEL_BASE_URL or production.
  --variations           Include reply variations when using generate.
  --json                 Print the full API response as JSON.
  --show                 Show saved configuration when using configure.
  --clear                Delete saved configuration when using configure.
  -h, --help             Show this help message.`;

const setupGuidance =
  'Run "thinkfeel configure" or set THINKFEEL_API_KEY and THINKFEEL_PERSONA_ID.';
const commands = new Set(["configure", "generate", "personify"]);

type CliValues = Record<string, string | boolean | undefined>;

type CliConfig = {
  apiKey?: string;
  baseUrl?: string;
  personaId?: string;
};

function getStringOption(
  values: CliValues,
  kebabName: string,
  camelName: string,
) {
  const kebabValue = values[kebabName];
  if (typeof kebabValue === "string") return kebabValue;

  const camelValue = values[camelName];
  if (typeof camelValue === "string") return camelValue;

  return undefined;
}

function getConfigDir() {
  const override = process.env.THINKFEEL_CONFIG_DIR?.trim();
  if (override) return override;

  const home = homedir();
  if (!home) throw new Error("Unable to determine home directory.");

  if (platform() === "darwin") {
    return path.join(home, "Library", "Application Support", "thinkfeel");
  }

  if (platform() === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "thinkfeel",
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
    "thinkfeel",
  );
}

function getConfigPath() {
  return path.join(getConfigDir(), "config.json");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function normalizeConfig(rawConfig: unknown): CliConfig {
  if (!rawConfig || typeof rawConfig !== "object") return {};

  const config = rawConfig as CliConfig;
  return {
    apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
    personaId:
      typeof config.personaId === "string" ? config.personaId : undefined,
  };
}

async function readSavedConfig(): Promise<CliConfig> {
  const configPath = getConfigPath();

  try {
    return normalizeConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return {};

    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid ThinkFeel config at ${configPath}. Run "thinkfeel configure --clear" and configure it again.`,
      );
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

async function clearSavedConfig() {
  await rm(getConfigPath(), { force: true });
}

function maskSecret(secret: string | undefined) {
  if (!secret) return "(not set)";
  if (secret.length <= 8) return "********";

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function printConfig(config: CliConfig) {
  console.log(`Config path: ${getConfigPath()}`);
  console.log(`API key: ${maskSecret(config.apiKey)}`);
  console.log(`Persona ID: ${config.personaId || "(not set)"}`);
  console.log(`Base URL: ${config.baseUrl || "(not set)"}`);
}

function promptVisible(question: string) {
  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptHidden(question: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return promptVisible(question);
  }

  return new Promise<string>((resolve, reject) => {
    let answer = "";
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = stdin.isRaw;

    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    function onData(buffer: Buffer) {
      const text = buffer.toString("utf8");

      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          stdout.write("\n");
          reject(new Error("Configuration cancelled."));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(answer);
          return;
        }

        if (char === "\u007f" || char === "\b") {
          answer = answer.slice(0, -1);
          continue;
        }

        answer += char;
      }
    }

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function requireInput(command: string, input: string) {
  if (!input.trim()) {
    throw new Error(`Missing input for "${command}".\n\n${usage}`);
  }
}

function formatChunks(chunks: string[], fallback: string) {
  if (chunks.length > 0) return chunks.join("\n");
  return fallback;
}

async function resolveRuntimeConfig(values: CliValues): Promise<CliConfig> {
  const savedConfig = await readSavedConfig();

  return {
    apiKey:
      getStringOption(values, "api-key", "apiKey") ??
      process.env.THINKFEEL_API_KEY ??
      savedConfig.apiKey,
    baseUrl:
      getStringOption(values, "base-url", "baseUrl") ??
      process.env.THINKFEEL_BASE_URL ??
      savedConfig.baseUrl,
    personaId:
      getStringOption(values, "persona-id", "personaId") ??
      process.env.THINKFEEL_PERSONA_ID ??
      savedConfig.personaId,
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

  const flagApiKey = getStringOption(values, "api-key", "apiKey");
  const flagPersonaId = getStringOption(values, "persona-id", "personaId");
  const flagBaseUrl = getStringOption(values, "base-url", "baseUrl");
  const canPrompt = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const hasRequiredFlags = Boolean(flagApiKey && flagPersonaId);

  let apiKey = flagApiKey;
  let personaId = flagPersonaId;
  let baseUrl = flagBaseUrl;

  if (!apiKey && canPrompt) {
    apiKey = (await promptHidden("Curve API key: ")).trim();
  }

  if (!personaId && canPrompt) {
    personaId = (await promptVisible("Default persona ID: ")).trim();
  }

  if (baseUrl === undefined && canPrompt && !hasRequiredFlags) {
    baseUrl = (await promptVisible("Base URL (optional): ")).trim();
  }

  if (!apiKey) throw new Error("Missing API key.");
  if (!personaId) throw new Error("Missing persona ID.");

  const nextConfig: CliConfig = {
    apiKey,
    personaId,
  };

  if (baseUrl) {
    nextConfig.baseUrl = baseUrl;
  }

  await writeSavedConfig(nextConfig);
  console.log(`Saved ThinkFeel config at ${getConfigPath()}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      apiKey: { type: "string" },
      baseUrl: { type: "string" },
      "api-key": { type: "string" },
      personaId: { type: "string" },
      "base-url": { type: "string" },
      "persona-id": { type: "string" },
      json: { type: "boolean", default: false },
      show: { type: "boolean", default: false },
      clear: { type: "boolean", default: false },
      variations: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0];

  if (!command || command === "help" || values.help) {
    console.log(usage);
    return;
  }

  if (!commands.has(command)) {
    throw new Error(`Unknown command: ${command}.\n\n${usage}`);
  }

  if (command === "configure") {
    await configure(values);
    return;
  }

  const { apiKey, personaId, baseUrl } = await resolveRuntimeConfig(values);

  if (!apiKey || !personaId) {
    throw new Error(setupGuidance);
  }

  const thinkFeel = new ThinkFeel({
    apiKey,
    baseUrl,
    personaId,
  });

  const input = positionals.slice(1).join(" ");

  if (command === "generate") {
    requireInput(command, input);

    const response = await thinkFeel.generate({
      messages: [{ role: "user", content: input }],
      includeVariations: Boolean(values.variations),
    });

    console.log(
      values.json
        ? JSON.stringify(response, null, 2)
        : formatChunks(response.chunks, response.finalReply),
    );
    return;
  }

  if (command === "personify") {
    requireInput(command, input);

    const response = await thinkFeel.personify({ raw: input });

    console.log(
      values.json
        ? JSON.stringify(response, null, 2)
        : formatChunks(response.chunks, response.personified),
    );
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`thinkfeel: ${message}`);
  process.exitCode = 1;
});
