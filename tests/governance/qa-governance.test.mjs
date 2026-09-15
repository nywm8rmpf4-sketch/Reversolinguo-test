import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { classifyFiles, loadPolicy, validateReuseProof, verifyCampaign } from '../../tools/qa-governance.mjs';

const policy = loadPolicy();
const classify = (files) => classifyFiles(files, policy);

test('A - editorial drafts select targeted QA and reject runtime over-test', () => {
  const result = classify(['catalogs/fr-es/a1/drafts/a1-tranche3.json', 'tests/unit/a1-tranche3-staging.test.ts', 'evidence/active/A1_TRANCHE3.md']);
  assert.equal(result.validation_profile, 'EDITORIAL_STAGING');
  assert.equal(result.fail_safe, false);
  const plan = verifyCampaign(result, 'staging/a1-tranche3-r1', 'editorial_targeted', policy);
  assert.equal(plan.produces_runtime_artifact, false);
  assert.throws(() => verifyCampaign(result, 'staging/a1-tranche3-r1', 'runtime_full', policy), /OVER_TEST/);
  assert.throws(() => verifyCampaign(result, 'candidate/a1-tranche3-r1', 'runtime_full', policy), /PROFILE_BRANCH_CONFLICT/);
});

test('B - SRS runtime change requires runtime campaign and rejects targeted under-test', () => {
  const result = classify(['src/domain/srsEngine.ts', 'tests/unit/srs.test.ts']);
  assert.equal(result.validation_profile, 'RUNTIME_CODE');
  const plan = verifyCampaign(result, 'candidate/srs-r1', 'runtime_full', policy);
  assert.equal(plan.produces_runtime_artifact, true);
  assert.throws(() => verifyCampaign(result, 'candidate/srs-r1', 'editorial_targeted', policy), /UNDER_TEST/);
});

test('C - UI change selects UI_UX with accessibility and E2E controls', () => {
  const result = classify(['src/components/VocabularyBrowser.tsx', 'tests/e2e/vocabulary.spec.ts']);
  assert.equal(result.validation_profile, 'UI_UX');
  const plan = verifyCampaign(result, 'candidate/ui-r1', 'runtime_full', policy);
  assert.ok(plan.required_controls.includes('ACCESSIBILITY'));
  assert.ok(plan.required_controls.includes('E2E'));
});

test('D - exact release promotion uses identity/integrity campaign without rebuild', () => {
  const result = classify(['certification/v1.1.0.json']);
  assert.equal(result.validation_profile, 'RELEASE_ONLY');
  const plan = verifyCampaign(result, 'certify/v1.1.0', 'release_identity', policy);
  assert.ok(plan.required_controls.includes('RELEASE_IDENTITY'));
  assert.ok(plan.required_controls.includes('NO_REBUILD'));
  assert.equal(plan.produces_runtime_artifact, false);
});

test('E - unknown path fails safe to strongest runtime profile', () => {
  const result = classify(['new-transversal-system/opaque.bin']);
  assert.equal(result.validation_profile, 'RUNTIME_CODE');
  assert.equal(result.fail_safe, true);
  assert.deepEqual(result.unknown_files, ['new-transversal-system/opaque.bin']);
  assert.throws(() => verifyCampaign(result, 'staging/ambiguous-r1', 'editorial_targeted', policy), /PROFILE_BRANCH_CONFLICT/);
  assert.doesNotThrow(() => verifyCampaign(result, 'candidate/ambiguous-r1', 'runtime_full', policy));
});

test('mixed profiles fail safe to RUNTIME_CODE rather than composing weak assumptions', () => {
  const result = classify(['catalogs/fr-es/a1/drafts/a1-tranche3.json', 'catalogs/fr-es/a1/catalog.json']);
  assert.equal(result.validation_profile, 'RUNTIME_CODE');
  assert.deepEqual(result.detected_profiles, ['EDITORIAL_STAGING', 'RUNTIME_CONTENT']);
  assert.equal(result.transversal, true);
  assert.equal(result.fail_safe, true);
  assert.ok(result.required_controls.includes('BUILD_RUNTIME'));
  assert.doesNotThrow(() => verifyCampaign(result, 'candidate/runtime-content-r1', 'runtime_full', policy));
});

test('PASS reuse proof is fail-closed and requires applicability fingerprints', () => {
  assert.throws(() => validateReuseProof({ source_sha: 'a'.repeat(40), target_sha: 'b'.repeat(40) }, policy), /PASS_REUSE_PROOF_INCOMPLETE/);
  assert.doesNotThrow(() => validateReuseProof({
    evidence_ref: 'evidence/active/EXAMPLE.md', source_sha: 'a'.repeat(40), target_sha: 'b'.repeat(40),
    contract_fingerprint: 'contract-v1', data_fingerprint: 'data-sha256:example', environment_fingerprint: 'node24-ubuntu',
    rationale: 'unchanged component and gate'
  }, policy));
});

test('public workflow contract keeps heavy QA away from staging and guards qualification refs first', { skip: !existsSync('.github/workflows/qa.yml') }, () => {
  const runtime = readFileSync('.github/workflows/qa.yml', 'utf8');
  const editorial = readFileSync('.github/workflows/editorial-qa.yml', 'utf8');
  const infra = readFileSync('.github/workflows/qa-governance.yml', 'utf8');
  const promotion = readFileSync('.github/workflows/promote-qualified.yml', 'utf8');

  assert.match(runtime, /candidate\/\*\*/);
  assert.doesNotMatch(runtime, /staging\/\*\*/);
  assert.match(runtime, /push:/);
  assert.doesNotMatch(runtime, /^\s*create:/m);
  assert.match(runtime, /github\.event\.created/);
  assert.match(runtime, /PUSH_CREATED/);
  assert.match(runtime, /qa-governance\.mjs plan/);
  assert.match(runtime, /--campaign runtime_full/);
  assert.ok(runtime.indexOf('immutable candidate branch contract') < runtime.indexOf('npm ci'));
  assert.ok(runtime.indexOf('qa-governance.mjs plan') < runtime.indexOf('playwright install'));

  assert.match(editorial, /staging\/\*\*/);
  assert.match(editorial, /push:/);
  assert.doesNotMatch(editorial, /^\s*create:/m);
  assert.match(editorial, /github\.event\.created/);
  assert.match(editorial, /PUSH_CREATED/);
  assert.match(editorial, /--campaign editorial_targeted/);
  for (const forbidden of ['playwright install', 'test:e2e', 'npm run build', 'reversolinguo-tested-dist-']) {
    assert.equal(editorial.includes(forbidden), false, `editorial workflow must exclude ${forbidden}`);
  }

  assert.match(infra, /qa\/\*\*/);
  assert.match(infra, /--campaign infra_targeted/);
  assert.match(promotion, /- QA candidate/);
  assert.doesNotMatch(promotion, /QA editorial staging/);
});
