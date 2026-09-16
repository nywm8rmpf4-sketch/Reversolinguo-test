import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const A1 = path.join(ROOT, 'catalogs/fr-es/a1')
const DRAFTS = path.join(A1, 'drafts')
const CATALOG = path.join(A1, 'catalog.json')
const MANIFEST = path.join(A1, 'manifest.json')
const SIG = path.join(A1, 'manifest.sig.json')
const KEY_TS = path.join(ROOT, 'src/content/catalogSigningKey.ts')
const REPORT = path.join(ROOT, 'evidence/active/A1_CANONICAL_PROMOTION_GENERATION_REPORT.json')

const EXPECTED_BASE_COUNT = 60
const EXPECTED_HISTORICAL_COUNT = 24
const EXPECTED_STAGING_COUNT = 415
const EXPECTED_SOURCE_MAP_COUNT = 13
const EXPECTED_EXCLUDED_COUNT = 32
const EXPECTED_RECONCILED_SOURCE_ROWS = 20
const EXPECTED_RECONCILED_CANONICAL_IDS = 21
const EXPECTED_UUID_OVERLAP_COUNT = 0
const EXPECTED_EXACT_LEMMA_OVERLAP_COUNT = 0
const EXPECTED_NEW_COUNT = 415
const EXPECTED_FINAL_COUNT = 475
const EXPECTED_HISTORICAL_JSON_SHA256 = '89ec57723e94709904361823018c0f92de85e41fca9867049fdd0a33ca57aa78'
const REVIEWED_BY = 'Project owner bilingual review'
const REVIEWED_AT = '2026-09-16'
const CATALOG_VERSION = '2026.09-a1-macro-r1'
const KEY_ID = 'fr-es-a1-macro-2026-09-k5'

function fail(message) {
  throw new Error(`A1_PROMOTION_FAIL: ${message}`)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[’']/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim()
}

function reasonClass(reason = '') {
  if (reason.startsWith('RECONCILED_EXISTING_CANONICAL')) return 'RECONCILED_EXISTING_CANONICAL'
  if (reason.startsWith('PEDAGOGICAL_REVERSE_AMBIGUITY')) return 'PEDAGOGICAL_REVERSE_AMBIGUITY'
  if (reason.startsWith('SOURCE_STATUS_MODERNISER')) return 'SOURCE_STATUS_MODERNISER'
  if (reason.startsWith('SOURCE_STATUS_ARBITRAGE_REGIONAL') || reason.includes('ARBITRAGE RÉGIONAL')) return 'SOURCE_STATUS_ARBITRAGE_REGIONAL'
  return 'OTHER'
}

const partFiles = fs.readdirSync(DRAFTS)
  .map((name) => {
    const match = /^a1-tranche(\d+)-r\d+-part-([a-z])\.json$/u.exec(name)
    return match ? { name, tranche: Number(match[1]), part: match[2] } : null
  })
  .filter(Boolean)
  .sort((a, b) => a.tranche - b.tranche || a.part.localeCompare(b.part))

const sourceMapFiles = fs.readdirSync(DRAFTS)
  .map((name) => {
    const match = /^a1-tranche(\d+)-r\d+-source-map\.json$/u.exec(name)
    return match ? { name, tranche: Number(match[1]) } : null
  })
  .filter(Boolean)
  .sort((a, b) => a.tranche - b.tranche)

if (partFiles.length === 0) fail('no tranche part files found')
if (sourceMapFiles.length !== EXPECTED_SOURCE_MAP_COUNT) fail(`source-map-count:${sourceMapFiles.length}`)

const staging = partFiles.flatMap(({ name }) => readJson(path.join(DRAFTS, name)))
const base = readJson(CATALOG)
const maps = sourceMapFiles.map(({ name }) => ({ name, data: readJson(path.join(DRAFTS, name)) }))
const included = maps.flatMap(({ name, data }) => (data.included ?? []).map((item) => ({ source_map: name, ...item })))
const excluded = maps.flatMap(({ name, data }) => (data.excluded ?? []).map((item) => ({ source_map: name, ...item })))

if (base.length !== EXPECTED_BASE_COUNT) fail(`base-count:${base.length}`)
if (staging.length !== EXPECTED_STAGING_COUNT) fail(`staging-count:${staging.length}`)
if (included.length !== EXPECTED_STAGING_COUNT) fail(`source-map-included-count:${included.length}`)
if (excluded.length !== EXPECTED_EXCLUDED_COUNT) fail(`source-map-excluded-count:${excluded.length}`)
if (included.length + excluded.length !== 447) fail(`source-map-total-count:${included.length + excluded.length}`)

const baseIds = new Set(base.map((entry) => entry.entry_id))
const stagingIds = new Set(staging.map((entry) => entry.entry_id))
const includedIds = new Set(included.map((item) => item.entry_id))
if (baseIds.size !== base.length) fail(`base-duplicate-ids:${base.length - baseIds.size}`)
if (stagingIds.size !== staging.length) fail(`staging-duplicate-ids:${staging.length - stagingIds.size}`)
if ([...stagingIds].some((id) => !includedIds.has(id)) || [...includedIds].some((id) => !stagingIds.has(id))) fail('source-map-included-staging-identity')

const uuidOverlap = staging.filter((entry) => baseIds.has(entry.entry_id))
if (uuidOverlap.length !== EXPECTED_UUID_OVERLAP_COUNT) fail(`uuid-overlap-count:${uuidOverlap.length}`)
const stagingLemmaSet = new Set(staging.map((entry) => norm(entry.lemma)))
const exactLemmaOverlap = base.filter((entry) => stagingLemmaSet.has(norm(entry.lemma)))
if (exactLemmaOverlap.length !== EXPECTED_EXACT_LEMMA_OVERLAP_COUNT) fail(`exact-lemma-overlap-count:${exactLemmaOverlap.length}`)

const reconciled = excluded.filter((item) => reasonClass(item.reason) === 'RECONCILED_EXISTING_CANONICAL')
if (reconciled.length !== EXPECTED_RECONCILED_SOURCE_ROWS) fail(`reconciled-source-rows:${reconciled.length}`)
const reconciledCanonicalIds = [...new Set(reconciled.flatMap((item) => (item.canonical_entries ?? []).map((entry) => entry.entry_id)))].sort()
if (reconciledCanonicalIds.length !== EXPECTED_RECONCILED_CANONICAL_IDS) fail(`reconciled-canonical-ids:${reconciledCanonicalIds.length}`)
const missingCanonicalRefs = reconciledCanonicalIds.filter((id) => !baseIds.has(id))
if (missingCanonicalRefs.length) fail(`missing-reconciled-canonical-refs:${missingCanonicalRefs.join(',')}`)
const reconciledWithoutRefs = reconciled.filter((item) => !Array.isArray(item.canonical_entries) || item.canonical_entries.length === 0)
if (reconciledWithoutRefs.length) fail(`reconciled-without-refs:${reconciledWithoutRefs.map((item) => item.review_id).join(',')}`)

const historicalHash = sha256(JSON.stringify(base.slice(0, EXPECTED_HISTORICAL_COUNT)))
if (historicalHash !== EXPECTED_HISTORICAL_JSON_SHA256) fail(`historical-hash:${historicalHash}`)

const newEntries = staging.map((entry) => ({
  ...entry,
  provenance: {
    ...entry.provenance,
    reviewed_by: REVIEWED_BY,
    reviewed_at: REVIEWED_AT
  },
  status: 'reviewed'
}))

if (newEntries.length !== EXPECTED_NEW_COUNT) fail(`new-count:${newEntries.length}`)
if (!newEntries.every((entry) => entry.status === 'reviewed' && entry.provenance.reviewed_by === REVIEWED_BY && entry.provenance.reviewed_at === REVIEWED_AT)) fail('review-metadata')

const promoted = [...base, ...newEntries]
const promotedIds = new Set(promoted.map((entry) => entry.entry_id))
if (promoted.length !== EXPECTED_FINAL_COUNT) fail(`final-count:${promoted.length}`)
if (promotedIds.size !== EXPECTED_FINAL_COUNT) fail(`final-unique-count:${promotedIds.size}`)
if (!staging.every((entry) => promotedIds.has(entry.entry_id))) fail('not-all-approved-staging-ids-promoted')

const catalogText = `[\n${promoted.map((entry) => JSON.stringify(entry)).join(',\n')}\n]\n`
const catalogSha256 = sha256(catalogText)
fs.writeFileSync(CATALOG, catalogText, 'utf8')

const previousManifest = readJson(MANIFEST)
const manifest = {
  ...previousManifest,
  catalog_version: CATALOG_VERSION,
  entry_count: EXPECTED_FINAL_COUNT,
  catalog_sha256: catalogSha256,
  status: 'validated',
  human_review: 'PASS'
}
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
fs.writeFileSync(MANIFEST, manifestText, 'utf8')

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const publicJwk = publicKey.export({ format: 'jwk' })
const signature = sign('sha256', Buffer.from(manifestText, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' })
if (signature.length !== 64) fail(`signature-length:${signature.length}`)

const signatureDocument = {
  key_id: KEY_ID,
  algorithm: 'ECDSA-P256-SHA256',
  signature_base64: signature.toString('base64')
}
fs.writeFileSync(SIG, `${JSON.stringify(signatureDocument, null, 2)}\n`, 'utf8')

if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' || !publicJwk.x || !publicJwk.y || publicJwk.d) fail('invalid-public-jwk')
const keyTs = `export const catalogSigningKeyId = '${KEY_ID}'\n\nexport const catalogSigningPublicJwk: JsonWebKey = {\n  kty: 'EC',\n  crv: 'P-256',\n  x: '${publicJwk.x}',\n  y: '${publicJwk.y}',\n  ext: true,\n  key_ops: ['verify']\n}\n`
fs.writeFileSync(KEY_TS, keyTs, 'utf8')

if (!verify('sha256', Buffer.from(manifestText, 'utf8'), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)) fail('self-signature-verification')
if (sha256(fs.readFileSync(CATALOG, 'utf8')) !== manifest.catalog_sha256) fail('post-write-catalog-hash')

fs.mkdirSync(path.dirname(REPORT), { recursive: true })
const reasonCounts = Object.fromEntries([...new Set(excluded.map((item) => reasonClass(item.reason)))].sort().map((key) => [key, excluded.filter((item) => reasonClass(item.reason) === key).length]))
const report = {
  generated_at: new Date().toISOString(),
  source_staging: {
    expected_candidate_sha: '3076a602351ce9bc21b600f8119ae5b704f77f10',
    draft_count: staging.length,
    tranche_part_files: partFiles.map(({ name }) => name),
    source_map_files: sourceMapFiles.map(({ name }) => name),
    excluded_count: excluded.length,
    exclusion_reason_counts: reasonCounts
  },
  base_count: base.length,
  historical_count: EXPECTED_HISTORICAL_COUNT,
  historical_json_sha256: historicalHash,
  uuid_overlap_count: uuidOverlap.length,
  exact_lemma_overlap_count: exactLemmaOverlap.length,
  reconciled_source_rows: reconciled.length,
  reconciled_unique_canonical_ids: reconciledCanonicalIds.length,
  reconciled_canonical_ids: reconciledCanonicalIds,
  new_count: newEntries.length,
  final_count: promoted.length,
  final_unique_count: promotedIds.size,
  catalog_sha256: catalogSha256,
  catalog_version: CATALOG_VERSION,
  key_id: KEY_ID,
  private_key_persisted: false,
  human_review: 'PASS',
  reviewed_by: REVIEWED_BY,
  reviewed_at: REVIEWED_AT
}
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(JSON.stringify(report, null, 2))
