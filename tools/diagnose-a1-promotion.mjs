import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const a1 = path.join(root, 'catalogs/fr-es/a1')
const draftsDir = path.join(a1, 'drafts')
const base = JSON.parse(fs.readFileSync(path.join(a1, 'catalog.json'), 'utf8'))
const baseIds = new Set(base.map((entry) => entry.entry_id))

const partFiles = fs.readdirSync(draftsDir).map((name) => {
  const match = /^a1-tranche(\d+)-r\d+-part-([a-z])\.json$/u.exec(name)
  return match ? { name, tranche: Number(match[1]), part: match[2] } : null
}).filter(Boolean).sort((a, b) => a.tranche - b.tranche || a.part.localeCompare(b.part))
const staging = partFiles.flatMap(({ name }) => JSON.parse(fs.readFileSync(path.join(draftsDir, name), 'utf8')))
const stagingIds = new Set(staging.map((entry) => entry.entry_id))

const sourceMapFiles = fs.readdirSync(draftsDir).filter((name) => /^a1-tranche\d+-r\d+-source-map\.json$/u.test(name)).sort((a, b) => {
  const ai = Number(a.match(/tranche(\d+)/u)[1]); const bi = Number(b.match(/tranche(\d+)/u)[1]); return ai-bi
})
const maps = sourceMapFiles.map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(draftsDir, name), 'utf8')) }))
const included = maps.flatMap(({ name, data }) => (data.included ?? []).map((item) => ({ source_map: name, ...item })))
const excluded = maps.flatMap(({ name, data }) => (data.excluded ?? []).map((item) => ({ source_map: name, ...item })))

const norm = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[’']/gu, "'").replace(/\s+/gu, ' ').trim()
const stagingLemmaSet = new Set(staging.map((entry) => norm(entry.lemma)))
const exactLemmaOverlap = base.filter((entry) => stagingLemmaSet.has(norm(entry.lemma)))
const uuidOverlap = staging.filter((entry) => baseIds.has(entry.entry_id))

const reasonClass = (reason = '') => {
  if (reason.startsWith('RECONCILED_EXISTING_CANONICAL')) return 'RECONCILED_EXISTING_CANONICAL'
  if (reason.startsWith('PEDAGOGICAL_REVERSE_AMBIGUITY')) return 'PEDAGOGICAL_REVERSE_AMBIGUITY'
  if (reason.startsWith('SOURCE_STATUS_MODERNISER')) return 'SOURCE_STATUS_MODERNISER'
  if (reason.startsWith('SOURCE_STATUS_ARBITRAGE_REGIONAL') || reason.includes('ARBITRAGE RÉGIONAL')) return 'SOURCE_STATUS_ARBITRAGE_REGIONAL'
  return 'OTHER'
}
const reasonCounts = Object.fromEntries([...new Set(excluded.map((item) => reasonClass(item.reason)))].sort().map((key) => [key, excluded.filter((item) => reasonClass(item.reason) === key).length]))
const reconciled = excluded.filter((item) => reasonClass(item.reason) === 'RECONCILED_EXISTING_CANONICAL')
const referencedCanonicalIds = [...new Set(reconciled.flatMap((item) => (item.canonical_entries ?? []).map((entry) => entry.entry_id)))].sort()
const missingCanonicalRefs = referencedCanonicalIds.filter((id) => !baseIds.has(id))
const reconciledWithoutRefs = reconciled.filter((item) => !Array.isArray(item.canonical_entries) || item.canonical_entries.length === 0).map((item) => item.review_id)
const includedMapIds = new Set(included.map((item) => item.entry_id))
const stagingMissingFromMaps = [...stagingIds].filter((id) => !includedMapIds.has(id))
const mapIncludedMissingFromStaging = [...includedMapIds].filter((id) => !stagingIds.has(id))

const report = {
  base_count: base.length,
  staging_count: staging.length,
  staging_unique_ids: stagingIds.size,
  uuid_overlap_count: uuidOverlap.length,
  exact_lemma_overlap_count: exactLemmaOverlap.length,
  source_map_count: maps.length,
  source_map_included_count: included.length,
  source_map_excluded_count: excluded.length,
  source_map_total_count: included.length + excluded.length,
  reason_counts: reasonCounts,
  reconciled_source_rows: reconciled.length,
  reconciled_unique_canonical_ids: referencedCanonicalIds.length,
  reconciled_canonical_ids: referencedCanonicalIds,
  missing_canonical_refs: missingCanonicalRefs,
  reconciled_without_refs: reconciledWithoutRefs,
  staging_missing_from_source_maps: stagingMissingFromMaps,
  source_map_included_missing_from_staging: mapIncludedMissingFromStaging,
  projected_final_canonical_count_if_base_preserved_and_all_staging_added: base.length + staging.length
}

if (base.length !== 60) throw new Error(`unexpected base count ${base.length}`)
if (staging.length !== 415 || stagingIds.size !== 415) throw new Error(`unexpected staging count/uniqueness ${staging.length}/${stagingIds.size}`)
if (uuidOverlap.length !== 0) throw new Error(`unexpected UUID overlap ${uuidOverlap.length}`)
if (exactLemmaOverlap.length !== 0) throw new Error(`unexpected lemma overlap ${exactLemmaOverlap.length}`)
if (maps.length !== 13 || included.length !== 415 || excluded.length !== 32 || included.length + excluded.length !== 447) throw new Error('source-map accounting mismatch')
if (missingCanonicalRefs.length || reconciledWithoutRefs.length || stagingMissingFromMaps.length || mapIncludedMissingFromStaging.length) throw new Error('source-map reconciliation integrity mismatch')

console.log('A1_PROMOTION_DIAGNOSTIC_BEGIN')
console.log(JSON.stringify(report, null, 2))
console.log('A1_PROMOTION_DIAGNOSTIC_END')
