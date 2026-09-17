import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContextPacket } from '../../tools/project-context.mjs';
import { classifyFiles, loadPolicy } from '../../tools/qa-governance.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'reversolinguo-context-'));
  const files = {
    'AGENTS.md': '# agents\n',
    'REPRISE.md': '# reprise\n',
    'PROJECT_PLAN.md': '# plan\n',
    'documentation/PROJECT_STATE.md': '# state\n',
    'documentation/governance/DEVELOPMENT_EFFICIENCY_PLAYBOOK.md': '# efficiency\n',
    'pack_initialisation_retour_experience.md': '# rex\n'
  };
  for (const [relative, content] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(join(absolute, '..'), { recursive: true });
    writeFileSync(absolute, content);
  }
  writeFileSync(join(root, 'PROJECT_MANIFEST.json'), JSON.stringify({
    schema_version: '1.4',
    project: 'Reversolinguo',
    context_loading: {
      mode: 'minimal_routed',
      always_read: ['AGENTS.md', 'PROJECT_MANIFEST.json', 'CHECKPOINT_STATE.json', 'REPRISE.md'],
      conditional_core: ['PROJECT_PLAN.md', 'documentation/PROJECT_STATE.md'],
      conditional_core_rule: 'on workstream change',
      historical_adr_rule: 'only when applicable'
    },
    routes: {
      optimization: ['documentation/governance/DEVELOPMENT_EFFICIENCY_PLAYBOOK.md', 'pack_initialisation_retour_experience.md'],
      development: ['relevant_ADRs']
    }
  }, null, 2));
  writeFileSync(join(root, 'CHECKPOINT_STATE.json'), JSON.stringify({
    schema_version: '1.4',
    project: 'Reversolinguo',
    milestone: 'OPT_GOV_R2',
    status: 'ACTIVE',
    current_task: 'reduce context cost',
    next_task: 'qualify governance tooling',
    blocking_issue: null,
    source_master: { repository: 'owner/private', work_branch: 'work/opt-governance-r2' },
    certified_release: { release_label: 'v1.0.1' },
    gates: { CHANGE_READY: 'YES' }
  }, null, 2));
  return root;
}

test('optimization route returns minimal documents and active state', () => {
  const root = fixture();
  const packet = buildContextPacket({ route: 'optimization', root });
  assert.equal(packet.project, 'Reversolinguo');
  assert.equal(packet.active_state.milestone, 'OPT_GOV_R2');
  assert.equal(packet.active_state.work_branch, 'work/opt-governance-r2');
  assert.equal(packet.include_core, false);
  assert.ok(packet.documents.includes('AGENTS.md'));
  assert.ok(packet.documents.includes('documentation/governance/DEVELOPMENT_EFFICIENCY_PLAYBOOK.md'));
  assert.equal(packet.documents.includes('PROJECT_PLAN.md'), false);
});

test('conditional core is included only when explicitly requested', () => {
  const root = fixture();
  const packet = buildContextPacket({ route: 'optimization', includeCore: true, root });
  assert.ok(packet.documents.includes('PROJECT_PLAN.md'));
  assert.ok(packet.documents.includes('documentation/PROJECT_STATE.md'));
});

test('symbolic selectors are preserved without pretending to resolve historical ADRs', () => {
  const root = fixture();
  const packet = buildContextPacket({ route: 'development', root });
  assert.deepEqual(packet.selectors, ['relevant_ADRs']);
});

test('unknown route fails closed', () => {
  const root = fixture();
  assert.throws(() => buildContextPacket({ route: 'does-not-exist', root }), /UNKNOWN_CONTEXT_ROUTE/);
});

test('missing routed document fails closed', () => {
  const root = fixture();
  const manifestPath = join(root, 'PROJECT_MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.routes.optimization.push('documentation/governance/MISSING.md');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.throws(() => buildContextPacket({ route: 'optimization', root }), /ROUTED_DOCUMENT_MISSING/);
});

test('invalid checkpoint JSON fails closed', () => {
  const root = fixture();
  writeFileSync(join(root, 'CHECKPOINT_STATE.json'), '{ invalid');
  assert.throws(() => buildContextPacket({ route: 'optimization', root }), /CHECKPOINT_STATE_JSON_INVALID/);
});

test('project context tooling is classified as INFRA_QA', () => {
  const policy = loadPolicy();
  const result = classifyFiles(['tools/project-context.mjs', 'tests/governance/project-context.test.mjs'], policy);
  assert.equal(result.validation_profile, 'INFRA_QA');
  assert.equal(result.transversal, false);
});
