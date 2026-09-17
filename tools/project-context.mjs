#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`${label}_READ_FAIL: ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label}_JSON_INVALID: ${path}: ${error.message}`);
  }
}

function isSelector(value) {
  return !value.includes('/') && !value.includes('.') && !value.endsWith('.json') && !value.endsWith('.md');
}

function unique(values) {
  return [...new Set(values)];
}

function requireFile(root, relativePath) {
  const absolute = resolve(root, relativePath);
  if (!existsSync(absolute)) throw new Error(`ROUTED_DOCUMENT_MISSING: ${relativePath}`);
  return relativePath;
}

export function loadProjectState(root = DEFAULT_ROOT) {
  const manifestPath = resolve(root, 'PROJECT_MANIFEST.json');
  const checkpointPath = resolve(root, 'CHECKPOINT_STATE.json');
  const manifest = readJson(manifestPath, 'PROJECT_MANIFEST');
  const checkpoint = readJson(checkpointPath, 'CHECKPOINT_STATE');

  if (!manifest.context_loading || manifest.context_loading.mode !== 'minimal_routed') {
    throw new Error('PROJECT_MANIFEST_CONTEXT_LOADING_INVALID');
  }
  if (!Array.isArray(manifest.context_loading.always_read) || manifest.context_loading.always_read.length === 0) {
    throw new Error('PROJECT_MANIFEST_ALWAYS_READ_INVALID');
  }
  if (!manifest.routes || typeof manifest.routes !== 'object') {
    throw new Error('PROJECT_MANIFEST_ROUTES_INVALID');
  }
  for (const key of ['project', 'milestone', 'status', 'current_task', 'next_task']) {
    if (typeof checkpoint[key] !== 'string' || checkpoint[key].trim() === '') {
      throw new Error(`CHECKPOINT_STATE_REQUIRED_FIELD_INVALID: ${key}`);
    }
  }
  return { manifest, checkpoint };
}

export function buildContextPacket({ route = null, includeCore = false, root = DEFAULT_ROOT } = {}) {
  const { manifest, checkpoint } = loadProjectState(root);

  const routed = [];
  if (route !== null) {
    if (!Object.hasOwn(manifest.routes, route)) throw new Error(`UNKNOWN_CONTEXT_ROUTE: ${route}`);
    if (!Array.isArray(manifest.routes[route])) throw new Error(`CONTEXT_ROUTE_INVALID: ${route}`);
    routed.push(...manifest.routes[route]);
  }

  const candidates = [
    ...manifest.context_loading.always_read,
    ...(includeCore ? (manifest.context_loading.conditional_core ?? []) : []),
    ...routed
  ];

  const selectors = unique(candidates.filter(isSelector));
  const documents = unique(candidates.filter((value) => !isSelector(value))).map((value) => requireFile(root, value));

  const sourceMaster = checkpoint.source_master ?? {};
  const certifiedRelease = checkpoint.certified_release ?? {};

  return {
    schema_version: '1.0',
    project: checkpoint.project,
    route,
    include_core: includeCore,
    active_state: {
      milestone: checkpoint.milestone,
      status: checkpoint.status,
      current_task: checkpoint.current_task,
      next_task: checkpoint.next_task,
      blocking_issue: checkpoint.blocking_issue ?? null,
      work_branch: sourceMaster.work_branch ?? null,
      source_repository: sourceMaster.repository ?? null,
      certified_release: certifiedRelease.release_label ?? null,
      gates: checkpoint.gates ?? {}
    },
    documents,
    selectors,
    routing_policy: {
      mode: manifest.context_loading.mode,
      conditional_core_rule: manifest.context_loading.conditional_core_rule ?? null,
      historical_adr_rule: manifest.context_loading.historical_adr_rule ?? null
    }
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function parseBoolean(value, name) {
  if (value === undefined) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command !== 'packet') throw new Error(`Unknown command: ${command ?? '<missing>'}`);
  const packet = buildContextPacket({
    route: options.route ?? null,
    includeCore: parseBoolean(options['include-core'], '--include-core'),
    root: options.root ? resolve(options.root) : DEFAULT_ROOT
  });
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`PROJECT_CONTEXT_FAIL: ${error.message}\n`);
    process.exitCode = 2;
  }
}
