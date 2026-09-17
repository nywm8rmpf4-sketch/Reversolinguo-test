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
  assert.throws(() => verifyCampaign(result, 'staging/a1-tranche3-r1', 'runtime_full', policy), /OVER_TEST|CAMPAIGN_BRANCH_CONFLICT/);
  assert.throws(() => verifyCampaign(result, 'candidate/a1-tranche3-r1', 'runtime_full', policy), /PROFILE_BRANCH_CONFLICT/);
});

test('B - SRS runtime change requires runtime campaign and rejects targeted under-test', () => {
  const result = classify(['src/domain/srsEngine.ts', 'tests/unit/srs.test.ts']);
  assert.equal(result.validation_profile, 'RUNTIME_CODE');
  const plan = verifyCampaign(result, 'candidate/srs-r1', 'runtime_full', policy);
  assert.equal(plan.produces_runtime_artifact, true);
  assert.throws(() => verifyCampaign(result, 'candidate/srs-r1', 'editorial_targeted', policy), /UNDER_TEST|CAMPAIGN_BRANCH_CONFLICT/);
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

test('F - runtime data-only catalog diff selects targeted artifact campaign', () => {
  const result = classify([
    'catalogs/fr-es/a1/catalog.json',
    'catalogs/fr-es/a1/manifest.json',
    'catalogs/fr-es/a1/manifest.sig.json',
    'catalogs/fr-es/a1/runtime-projection.json',
    'evidence/active/DATA_ONLY.md'
  ]);
  assert.equal(result.validation_profile, 'RUNTIME_DATA_ONLY');
  assert.equal(result.transversal, false);
  assert.equal(result.fail_safe, false);
  const plan = verifyCampaign(result, 'data-candidate/a1-r1', 'runtime_data_targeted', policy);
  assert.equal(plan.produces_runtime_artifact, true);
  assert.ok(plan.required_controls.includes('CATALOG_PROJECTION'));
  assert.ok(plan.required_controls.includes('CATALOG_INTEGRITY'));
  assert.ok(plan.required_controls.includes('UNIT'));
  assert.equal(plan.required_controls.includes('E2E'), false);
  assert.throws(() => verifyCampaign(result, 'candidate/a1-r1', 'runtime_full', policy), /PROFILE_BRANCH_CONFLICT/);
});

test('all seven named profiles have a direct representative classification', () => {
  const representatives = [
    ['EDITORIAL_STAGING', ['catalogs/fr-es/a1/drafts/a1-tranche3.json']],
    ['INFRA_QA', ['documentation/governance/QA_IMPACT_POLICY.json']],
    ['RUNTIME_DATA_ONLY', ['catalogs/fr-es/a1/catalog.json']],
    ['RUNTIME_CONTENT', ['src/content/packData.ts']],
    ['RUNTIME_CODE', ['src/domain/srsEngine.ts']],
    ['UI_UX', ['src/components/VocabularyBrowser.tsx']],
    ['RELEASE_ONLY', ['certification/v1.1.0.json']]
  ];

  for (const [expectedProfile, files] of representatives) {
    const result = classify(files);
    assert.equal(result.validation_profile, expectedProfile, `${files.join(', ')} should classify as ${expectedProfile}`);
    assert.equal(result.transversal, false);
  }

  const infraPlan = verifyCampaign(classify(['documentation/governance/QA_IMPACT_POLICY.json']), 'qa/profile-coverage-r1', 'infra_targeted', policy);
  assert.equal(infraPlan.produces_runtime_artifact, false);
  const dataPlan = verifyCampaign(classify(['catalogs/fr-es/a1/catalog.json']), 'data-candidate/runtime-data-r1', 'runtime_data_targeted', policy);
  assert.equal(dataPlan.produces_runtime_artifact, true);
});

test('mixed data-only and code profiles fail safe to RUNTIME_CODE', () => {
  const result = classify(['catalogs/fr-es/a1/catalog.json', 'src/content/catalog.ts']);
  assert.equal(result.validation_profile, 'RUNTIME_CODE');
  assert.deepEqual(result.detected_profiles, ['RUNTIME_DATA_ONLY', 'RUNTIME_CODE']);
  assert.equal(result.transversal, true);
  assert.equal(result.fail_safe, true);
  assert.ok(result.required_controls.includes('E2E'));
  assert.doesNotThrow(() => verifyCampaign(result, 'candidate/runtime-code-r1', 'runtime_full', policy));
});

test('mixed editorial and runtime data profiles fail safe to RUNTIME_CODE', () => {
  const result = classify(['catalogs/fr-es/a1/drafts/a1-tranche3.json', 'catalogs/fr-es/a1/catalog.json']);
  assert.equal(result.validation_profile, 'RUNTIME_CODE');
  assert.deepEqual(result.detected_profiles, ['EDITORIAL_STAGING', 'RUNTIME_DATA_ONLY']);
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

test('public workflow contract exposes distinct editorial, infra, data-only, runtime, signing and promotion lanes', { skip: !existsSync('.github/workflows/qa.yml') }, () => {
  const runtime = readFileSync('.github/workflows/qa.yml', 'utf8');
  const dataOnly = readFileSync('.github/workflows/data-qa.yml', 'utf8');
  const editorial = readFileSync('.github/workflows/editorial-qa.yml', 'utf8');
  const infra = readFileSync('.github/workflows/qa-governance.yml', 'utf8');
  const signing = readFileSync('.github/workflows/catalog-signing-authority.yml', 'utf8');
  const promotion = readFileSync('.github/workflows/promote-qualified.yml', 'utf8');

  assert.match(runtime, /candidate\/\*\*/);
  assert.doesNotMatch(runtime, /data-candidate\/\*\*/);
  assert.doesNotMatch(runtime, /staging\/\*\*/);
  assert.match(runtime, /push:/);
  assert.doesNotMatch(runtime, /^\s*create:/m);
  assert.match(runtime, /github\.event\.created/);
  assert.match(runtime, /PUSH_CREATED/);
  assert.match(runtime, /qa-governance\.mjs plan/);
  assert.match(runtime, /--campaign runtime_full/);
  assert.ok(runtime.indexOf('immutable candidate branch contract') < runtime.indexOf('npm ci'));
  assert.ok(runtime.indexOf('qa-governance.mjs plan') < runtime.indexOf('playwright install'));

  assert.match(dataOnly, /data-candidate\/\*\*/);
  assert.match(dataOnly, /--campaign runtime_data_targeted/);
  assert.match(dataOnly, /github\.event\.created/);
  assert.match(dataOnly, /PUSH_CREATED/);
  assert.match(dataOnly, /prepare-catalog-bundle\.mjs/);
  assert.match(dataOnly, /catalog-bundle\.test\.mjs/);
  assert.match(dataOnly, /catalog-signing\.test\.mjs/);
  assert.match(dataOnly, /npm run build/);
  assert.doesNotMatch(dataOnly, /playwright install/);
  assert.doesNotMatch(dataOnly, /test:e2e/);

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

  assert.match(signing, /workflow_dispatch:/);
  assert.doesNotMatch(signing, /^\s*push:/m);
  assert.doesNotMatch(signing, /^\s*pull_request:/m);
  assert.match(signing, /REVERSOLINGUO_CATALOG_SIGNING_KEY:\s*\$\{\{ secrets\.REVERSOLINGUO_CATALOG_SIGNING_KEY \}\}/);
  assert.match(signing, /\^assembly\/\(catalog-\|updated-a1-\)/);
  assert.match(signing, /Checkout trusted signing implementation from main/);
  assert.match(signing, /ref: main/);
  assert.match(signing, /path: trusted/);
  assert.match(signing, /path: target/);
  assert.match(signing, /provision-catalog-signing-authority\.mjs/);
  assert.match(signing, /sign-catalog-bundle\.mjs/);
  assert.match(signing, /qa-verify-catalog-signature\.mjs/);
  assert.match(signing, /prepare-catalog-bundle\.mjs/);
  assert.match(signing, /SIGNING_UNEXPECTED_OUTPUT_PATH/);
  assert.match(signing, /PRIVATE_KEY_FIELD_IN_PUBLIC_ANCHOR/);
  assert.doesNotMatch(signing, /upload-artifact/);
  assert.doesNotMatch(signing, /echo\s+.*REVERSOLINGUO_CATALOG_SIGNING_KEY/);

  assert.match(promotion, /- QA candidate/);
  assert.match(promotion, /- QA data candidate/);
  assert.match(promotion, /data-candidate\/\*\*/);
  assert.doesNotMatch(promotion, /QA editorial staging/);
});
