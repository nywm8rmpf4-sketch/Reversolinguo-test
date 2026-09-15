#!/usr/bin/env node

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_POLICY_PATH = resolve(ROOT, 'documentation/governance/QA_IMPACT_POLICY.json');

export function loadPolicy(policyPath = DEFAULT_POLICY_PATH) {
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  if (policy.schema_version !== '1.0') {
    throw new Error(`Unsupported QA impact policy schema: ${policy.schema_version}`);
  }
  return policy;
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => new RegExp(pattern).test(file));
}

export function classifyFiles(files, policy = loadPolicy()) {
  const normalized = [...new Set(files.map((file) => file.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) {
    throw new Error('EMPTY_DIFF: no changed file can be classified');
  }

  const neutralFiles = [];
  const unknownFiles = [];
  const perFile = [];
  const profiles = new Set();

  for (const file of normalized) {
    if (matchesAny(file, policy.neutral_path_patterns)) {
      neutralFiles.push(file);
      perFile.push({ file, profile: null, reason: 'neutral-operational-evidence' });
      continue;
    }

    const rule = policy.path_rules.find((candidate) => matchesAny(file, candidate.patterns));
    if (rule) {
      profiles.add(rule.profile);
      perFile.push({ file, profile: rule.profile, reason: 'path-rule' });
    } else {
      profiles.add(policy.default_unknown_profile);
      unknownFiles.push(file);
      perFile.push({ file, profile: policy.default_unknown_profile, reason: 'unknown-path-fail-safe' });
    }
  }

  if (profiles.size === 0) profiles.add('INFRA_QA');

  const precedence = new Map(policy.profile_precedence.map((profile, index) => [profile, index]));
  const detectedProfiles = [...profiles].sort((a, b) => precedence.get(a) - precedence.get(b));
  const validationProfile = detectedProfiles.at(-1);

  const requiredControls = new Set();
  const normallyExcluded = new Set();
  for (const profile of detectedProfiles) {
    const definition = policy.profiles[profile];
    if (!definition) throw new Error(`Profile missing from policy: ${profile}`);
    definition.mandatory.forEach((control) => requiredControls.add(control));
    definition.normally_excluded.forEach((control) => normallyExcluded.add(control));
  }
  for (const required of requiredControls) normallyExcluded.delete(required);

  return {
    validation_profile: validationProfile,
    detected_profiles: detectedProfiles,
    changed_files: normalized,
    neutral_files: neutralFiles,
    unknown_files: unknownFiles,
    per_file: perFile,
    transversal: detectedProfiles.length > 1,
    fail_safe: unknownFiles.length > 0 || (detectedProfiles.length === 1 && detectedProfiles[0] === 'INFRA_QA' && neutralFiles.length === normalized.length),
    required_controls: [...requiredControls].sort(),
    normally_excluded_controls: [...normallyExcluded].sort()
  };
}

export function resolveBranchContract(branch, policy = loadPolicy()) {
  const contract = policy.branch_contracts.find((candidate) => branch.startsWith(candidate.prefix));
  if (!contract) throw new Error(`BRANCH_CONTRACT_UNKNOWN: ${branch}`);
  return contract;
}

export function verifyCampaign(classification, branch, campaignId, policy = loadPolicy()) {
  const contract = resolveBranchContract(branch, policy);
  if (!contract.allowed_profiles.includes(classification.validation_profile)) {
    throw new Error(`PROFILE_BRANCH_CONFLICT: ${classification.validation_profile} is not allowed on ${branch}`);
  }

  const campaign = policy.campaigns[campaignId];
  if (!campaign) throw new Error(`UNKNOWN_CAMPAIGN: ${campaignId}`);
  const campaignControls = new Set(campaign.controls);

  const missing = classification.required_controls.filter((control) => !campaignControls.has(control));
  if (missing.length > 0) {
    throw new Error(`UNDER_TEST: campaign ${campaignId} misses mandatory controls: ${missing.join(', ')}`);
  }

  const unjustified = classification.normally_excluded_controls.filter((control) => campaignControls.has(control));
  if (unjustified.length > 0) {
    throw new Error(`OVER_TEST: campaign ${campaignId} includes normally excluded controls: ${unjustified.join(', ')}`);
  }

  if (contract.campaign !== campaignId) {
    throw new Error(`CAMPAIGN_BRANCH_CONFLICT: branch ${branch} requires ${contract.campaign}, got ${campaignId}`);
  }

  return {
    ...classification,
    branch,
    branch_contract: contract.prefix,
    campaign: campaignId,
    campaign_controls: [...campaignControls].sort(),
    produces_runtime_artifact: campaign.produces_runtime_artifact,
    verdict: 'PASS'
  };
}

export function validateReuseProof(proof, policy = loadPolicy()) {
  const missing = policy.reuse_proof_required_fields.filter((field) => {
    const value = proof[field];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  });
  if (missing.length > 0) {
    throw new Error(`PASS_REUSE_PROOF_INCOMPLETE: ${missing.join(', ')}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(proof.source_sha) || !/^[0-9a-f]{40}$/i.test(proof.target_sha)) {
    throw new Error('PASS_REUSE_PROOF_INVALID_SHA');
  }
  return { verdict: 'PASS', ...proof };
}

export function gitChangedFiles(base, head = 'HEAD') {
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', base, head], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

function emitGithubOutput(plan, outputPath) {
  const rows = [
    ['validation_profile', plan.validation_profile],
    ['campaign', plan.campaign],
    ['changed_file_count', String(plan.changed_files.length)],
    ['transversal', String(plan.transversal)],
    ['fail_safe', String(plan.fail_safe)],
    ['produces_runtime_artifact', String(plan.produces_runtime_artifact)],
    ['required_controls', plan.required_controls.join(',')],
    ['excluded_controls', plan.normally_excluded_controls.join(',')]
  ];
  appendFileSync(outputPath, `${rows.map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}

function writePlan(plan, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const policy = loadPolicy(options.policy ? resolve(ROOT, options.policy) : DEFAULT_POLICY_PATH);

  if (command === 'plan') {
    const files = options.files
      ? options.files.split(',').map((value) => value.trim()).filter(Boolean)
      : gitChangedFiles(options.base, options.head ?? 'HEAD');
    const classification = classifyFiles(files, policy);
    const plan = verifyCampaign(classification, options.branch, options.campaign, policy);
    if (options['plan-file']) writePlan(plan, resolve(ROOT, options['plan-file']));
    if (options['github-output']) emitGithubOutput(plan, options['github-output']);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  if (command === 'verify-reuse') {
    if (!options.file) throw new Error('verify-reuse requires --file');
    const proof = JSON.parse(readFileSync(resolve(ROOT, options.file), 'utf8'));
    process.stdout.write(`${JSON.stringify(validateReuseProof(proof, policy), null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command ?? '<missing>'}`);
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`QA_GOVERNANCE_FAIL: ${error.message}\n`);
    process.exitCode = 2;
  }
}
