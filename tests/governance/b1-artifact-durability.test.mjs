import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { bunzipSync } from 'node:zlib'
import test from 'node:test'

const manifest = JSON.parse(readFileSync('catalogs/fr-es/b1/durability-manifest.json', 'utf8'))
const encoded = readFileSync(manifest.canonical_input.path, 'utf8').split(String.fromCharCode(10)).join('').split(String.fromCharCode(13)).join('')
const csv = bunzipSync(Buffer.from(encoded, 'base64'))
const sha = createHash('sha256').update(csv).digest('hex')
const rows = csv.toString('utf8').trimEnd().split(String.fromCharCode(10)).length - 1

test('B1 durability payload reconstructs the exact canonical input', () => {
  assert.equal(manifest.status, 'HUMAN_VALIDATED')
  assert.equal(sha, manifest.canonical_input.decoded_csv_sha256)
  assert.equal(sha, 'd4e3dbc39b347d23829a7bdba2880daf48626c715580dfde1ee844b8555633ac')
  assert.equal(rows, 1189)
  assert.equal(manifest.rematerialization.result, 'PASS')
  assert.equal(manifest.final_qa.result, 'PASS')
  assert.equal(manifest.final_qa.rebuild, 'NO')
  assert.equal(manifest.reuse_contract.exact_match_action, 'REUSE_OR_NO_OP')
  assert.ok(manifest.reusable_intermediates.every((item) => item.retention_class === 'CHECKPOINT'))
})
