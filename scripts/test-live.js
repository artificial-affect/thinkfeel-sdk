const path = require('node:path');
const { tmpdir } = require('node:os');
const { ThinkFeel } = require('../dist');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdir, mkdtemp, rm } = require('node:fs/promises');

const rootDir = path.resolve(__dirname, '..');
const divider = '='.repeat(72);

function section(title) {
  console.log(`\n${divider}`);
  console.log(title);
  console.log(divider);
}

function step(label) {
  console.log(`--> ${label}`);
}

function passed(label) {
  console.log(`OK  ${label}`);
}

function snippet(value, maxLength = 180) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function summarizeText(label, value) {
  console.log(`    ${label}: ${snippet(value)}`);
}

function summarizeGenerate(response) {
  console.log(`    status: ${response.status}`);
  console.log(`    chunks: ${response.chunks.length}`);
  console.log(`    finalReply: ${snippet(response.finalReply)}`);

  if (response.replyChoices) {
    console.log(`    replyChoices: ${response.replyChoices.length}`);
  }
}

function summarizePersonify(response) {
  console.log(`    chunks: ${response.chunks.length}`);
  console.log(`    personified: ${snippet(response.personified)}`);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('YOUR_')) throw new Error(`Missing ${name}. Set it before running live tests.`);

  return value;
}

function getConfig() {
  return {
    apiKey: requireEnv('THINKFEEL_API_KEY'),
    baseUrl: requireEnv('THINKFEEL_BASE_URL'),
    personaId: requireEnv('THINKFEEL_PERSONA_ID'),
    generatePrompt:
      process.env.THINKFEEL_GENERATE_PROMPT?.trim() || 'I just got back from a long day and wanted to check in.',
    personifyRaw:
      process.env.THINKFEEL_PERSONIFY_RAW?.trim() ||
      'Thanks for reaching out. I can help with that. Send me the details when you have them.',
  };
}

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

function assertChunks(chunks, label) {
  assert.ok(Array.isArray(chunks), `${label}.chunks must be an array`);
  assert.ok(chunks.length > 0, `${label}.chunks must not be empty`);

  chunks.forEach((chunk, index) => assertNonEmptyString(chunk, `${label}.chunks[${index}]`));
}

function assertGenerateResponse(response, label, expectVariations = false) {
  assertNonEmptyString(response.status, `${label}.status`);
  assertNonEmptyString(response.finalReply, `${label}.finalReply`);

  assertChunks(response.chunks, label);

  if (expectVariations) {
    assert.ok(Array.isArray(response.replyChoices), `${label}.replyChoices must be an array`);
    assert.ok(response.replyChoices.length > 0, `${label}.replyChoices must not be empty`);

    response.replyChoices.forEach((choice, index) => assertNonEmptyString(choice, `${label}.replyChoices[${index}]`));
  }
}

function assertPersonifyResponse(response, label) {
  assertNonEmptyString(response.personified, `${label}.personified`);
  assertChunks(response.chunks, label);
}

async function packAndInstall(tempDir) {
  const appDir = path.join(tempDir, 'app');
  const packDir = path.join(tempDir, 'pack');
  const npmCacheDir = path.join(tempDir, 'npm-cache');
  const npmEnv = { ...process.env, npm_config_cache: npmCacheDir, npm_config_dry_run: 'false' };

  step('Create temporary package install workspace');
  console.log(`    workspace: ${tempDir}`);

  await mkdir(appDir, { recursive: true });
  await mkdir(packDir, { recursive: true });

  step('Pack current package tarball');
  const packResult = await exec('npm', ['pack', '--pack-destination', packDir, '--json'], { env: npmEnv, cwd: rootDir });
  const packageInfo = JSON.parse(packResult.stdout)[0];
  const tarballPath = path.join(packDir, packageInfo.filename);

  passed(`Packed ${packageInfo.filename}`);

  step('Initialize temporary consumer project');
  await exec('npm', ['init', '-y'], { cwd: appDir, env: npmEnv });

  step('Install packed package into temporary consumer project');
  await exec('npm', ['install', tarballPath], { cwd: appDir, env: npmEnv });
  passed('Installed packed package');

  return { appDir, npmCacheDir };
}

function cliEnv(config, extra = {}) {
  const env = {
    ...process.env,
    THINKFEEL_API_KEY: config.apiKey,
    THINKFEEL_BASE_URL: config.baseUrl,
    THINKFEEL_PERSONA_ID: config.personaId,
    ...extra,
  };

  return env;
}

const runCli = (appDir, env, args) => exec('npx', ['thinkfeel', ...args], { cwd: appDir, env });

function withoutRuntimeCredentials(configDir, npmCacheDir) {
  const env = { ...process.env, THINKFEEL_CONFIG_DIR: configDir, npm_config_cache: npmCacheDir };

  delete env.THINKFEEL_API_KEY;
  delete env.THINKFEEL_BASE_URL;
  delete env.THINKFEEL_PERSONA_ID;

  return env;
}

async function testSdk(config) {
  section('Live SDK');

  const thinkFeel = new ThinkFeel({ apiKey: config.apiKey, baseUrl: config.baseUrl, personaId: config.personaId });

  step('SDK generate');
  summarizeText('prompt', config.generatePrompt);
  const generate = await thinkFeel.generate({ messages: [{ role: 'user', content: config.generatePrompt }] });
  assertGenerateResponse(generate, 'SDK generate');
  passed('SDK generate');
  summarizeGenerate(generate);

  step('SDK generate with variations');
  const generateVariations = await thinkFeel.generate({
    includeVariations: true,
    messages: [{ role: 'user', content: config.generatePrompt }],
  });
  assertGenerateResponse(generateVariations, 'SDK generate variations', true);
  passed('SDK generate with variations');
  summarizeGenerate(generateVariations);

  step('SDK personify');
  summarizeText('raw', config.personifyRaw);
  const personify = await thinkFeel.personify({ raw: config.personifyRaw });
  assertPersonifyResponse(personify, 'SDK personify');
  passed('SDK personify');
  summarizePersonify(personify);

  passed('Live SDK tests');
}

async function testInstalledCli(config) {
  section('Installed CLI');

  const tempDir = await mkdtemp(path.join(tmpdir(), 'thinkfeel-live-'));

  try {
    const { appDir, npmCacheDir } = await packAndInstall(tempDir);

    const envOnlyConfigDir = path.join(tempDir, 'config-env-only');
    const savedConfigDir = path.join(tempDir, 'config-saved');

    step('CLI --help');
    const help = await runCli(appDir, cliEnv(config, { npm_config_cache: npmCacheDir }), ['--help']);

    assert.match(help.stdout, /--api-key <key>/);
    assert.match(help.stdout, /--persona-id <id>/);
    assert.match(help.stdout, /--base-url <url>/);
    assert.match(help.stdout, /--variations/);
    assert.match(help.stdout, /--json/);
    assert.match(help.stdout, /--show/);
    assert.match(help.stdout, /--clear/);
    passed('CLI --help');

    step('CLI generate using environment variables');
    const envGenerate = await runCli(
      appDir,
      cliEnv(config, { THINKFEEL_CONFIG_DIR: envOnlyConfigDir, npm_config_cache: npmCacheDir }),
      ['generate', config.generatePrompt]
    );
    assertNonEmptyString(envGenerate.stdout, 'CLI env generate stdout');
    assert.equal(envGenerate.stderr, '');
    passed('CLI generate using environment variables');
    summarizeText('stdout', envGenerate.stdout);

    step('CLI generate --json using explicit flags');
    const flagGenerateJson = await runCli(
      appDir,
      withoutRuntimeCredentials(path.join(tempDir, 'config-flags'), npmCacheDir),
      [
        'generate',
        '--api-key',
        config.apiKey,
        '--persona-id',
        config.personaId,
        '--base-url',
        config.baseUrl,
        '--json',
        config.generatePrompt,
      ]
    );
    const flagGenerateJsonResponse = JSON.parse(flagGenerateJson.stdout);
    assertGenerateResponse(flagGenerateJsonResponse, 'CLI flag generate json');
    assert.equal(flagGenerateJson.stderr, '');
    passed('CLI generate --json using explicit flags');
    summarizeGenerate(flagGenerateJsonResponse);

    step('CLI generate --variations using explicit flags');
    const flagGenerateVariations = await runCli(
      appDir,
      withoutRuntimeCredentials(path.join(tempDir, 'config-variations'), npmCacheDir),
      [
        'generate',
        '--api-key',
        config.apiKey,
        '--persona-id',
        config.personaId,
        '--base-url',
        config.baseUrl,
        '--variations',
        config.generatePrompt,
      ]
    );
    const flagGenerateVariationsResponse = JSON.parse(flagGenerateVariations.stdout);
    assertGenerateResponse(flagGenerateVariationsResponse, 'CLI flag generate variations', true);
    assert.equal(flagGenerateVariations.stderr, '');
    passed('CLI generate --variations using explicit flags');
    summarizeGenerate(flagGenerateVariationsResponse);

    step('CLI personify --json using explicit flags');
    const flagPersonifyJson = await runCli(
      appDir,
      withoutRuntimeCredentials(path.join(tempDir, 'config-personify'), npmCacheDir),
      [
        'personify',
        '--api-key',
        config.apiKey,
        '--persona-id',
        config.personaId,
        '--base-url',
        config.baseUrl,
        '--json',
        config.personifyRaw,
      ]
    );
    const flagPersonifyJsonResponse = JSON.parse(flagPersonifyJson.stdout);
    assertPersonifyResponse(flagPersonifyJsonResponse, 'CLI flag personify json');
    assert.equal(flagPersonifyJson.stderr, '');
    passed('CLI personify --json using explicit flags');
    summarizePersonify(flagPersonifyJsonResponse);

    const savedEnv = withoutRuntimeCredentials(savedConfigDir, npmCacheDir);

    step('CLI configure saved credentials in isolated temp config');
    const configure = await runCli(appDir, savedEnv, [
      'configure',
      '--api-key',
      config.apiKey,
      '--persona-id',
      config.personaId,
      '--base-url',
      config.baseUrl,
    ]);
    assert.match(configure.stdout, /Saved ThinkFeel config at /);
    assert.equal(configure.stderr, '');
    passed('CLI configure saved credentials');
    summarizeText('stdout', configure.stdout);

    step('CLI configure --show masks API key');
    const show = await runCli(appDir, savedEnv, ['configure', '--show']);

    assert.match(show.stdout, /API key: /);
    assert.ok(!show.stdout.includes(config.apiKey), 'configure --show must not print the raw API key');

    assert.ok(show.stdout.includes(`Base URL: ${config.baseUrl}`));
    assert.ok(show.stdout.includes(`Persona ID: ${config.personaId}`));

    assert.equal(show.stderr, '');
    passed('CLI configure --show');
    summarizeText('stdout', show.stdout);

    step('CLI generate using saved config');
    const savedGenerate = await runCli(appDir, savedEnv, ['generate', config.generatePrompt]);
    assertNonEmptyString(savedGenerate.stdout, 'CLI saved generate stdout');
    assert.equal(savedGenerate.stderr, '');
    passed('CLI generate using saved config');
    summarizeText('stdout', savedGenerate.stdout);

    step('CLI personify using saved config');
    const savedPersonify = await runCli(appDir, savedEnv, ['personify', config.personifyRaw]);
    assertNonEmptyString(savedPersonify.stdout, 'CLI saved personify stdout');
    assert.equal(savedPersonify.stderr, '');
    passed('CLI personify using saved config');
    summarizeText('stdout', savedPersonify.stdout);

    step('CLI configure --clear');
    const clear = await runCli(appDir, savedEnv, ['configure', '--clear']);
    assert.match(clear.stdout, /Deleted ThinkFeel config at /);
    assert.equal(clear.stderr, '');
    passed('CLI configure --clear');
    summarizeText('stdout', clear.stdout);

    step('CLI fails after config is cleared and no env vars are present');
    await assert.rejects(
      () => runCli(appDir, savedEnv, ['generate', config.generatePrompt]),
      error => {
        assert.match(error.stderr, /Run "thinkfeel configure" or set THINKFEEL_API_KEY and THINKFEEL_PERSONA_ID/);
        return true;
      }
    );
    passed('CLI fails after config clear');

    passed('Live installed CLI tests');
  } finally {
    step('Remove temporary package install workspace');
    await rm(tempDir, { recursive: true, force: true });
    passed('Removed temporary package install workspace');
  }
}

async function main() {
  const config = getConfig();

  section('Live ThinkFeel Test Suite');
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Persona ID: ${config.personaId}`);
  console.log(`Generate prompt: ${snippet(config.generatePrompt)}`);
  console.log(`Personify raw: ${snippet(config.personifyRaw)}`);

  await testSdk(config);
  await testInstalledCli(config);

  section('Result');
  passed('Live ThinkFeel test suite');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.startsWith('Missing THINKFEEL_')) console.error(`Error: ${message}`);
  else console.error(error);

  if (error.stdout) console.error('stdout:', error.stdout);
  if (error.stderr) console.error('stderr:', error.stderr);
  process.exitCode = 1;
});
