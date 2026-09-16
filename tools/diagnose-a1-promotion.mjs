import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const a1 = path.join(root, 'catalogs/fr-es/a1')
const draftsDir = path.join(a1, 'drafts')
const base = JSON.parse(fs.readFileSync(path.join(a1, 'catalog.json'), 'utf8'))

const partFiles = fs.readdirSync(draftsDir).map((name) => {
  const match = /^a1-tranche(\d+)-r\d+-part-([a-z])\.json$/u.exec(name)
  return match ? { name, tranche: Number(match[1]), part: match[2] } : null
}).filter(Boolean).sort((a, b) => a.tranche - b.tranche || a.part.localeCompare(b.part))
const staging = partFiles.flatMap(({ name }) => JSON.parse(fs.readFileSync(path.join(draftsDir, name), 'utf8')))

const sourceMapFiles = fs.readdirSync(draftsDir).filter((name) => /^a1-tranche\d+-r\d+-source-map\.json$/u.test(name)).sort((a, b) => {
  const ai = Number(a.match(/tranche(\d+)/u)[1]); const bi = Number(b.match(/tranche(\d+)/u)[1]); return ai-bi
})
const maps = sourceMapFiles.map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(draftsDir, name), 'utf8')) }))

const norm = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[’']/gu, "'").replace(/\s+/gu, ' ').trim()
const stagingByLemma = new Map()
for (const entry of staging) {
  const key = norm(entry.lemma)
  if (!stagingByLemma.has(key)) stagingByLemma.set(key, [])
  stagingByLemma.get(key).push(entry)
}

const lemmaMatches = []
for (const entry of base) {
  const matches = stagingByLemma.get(norm(entry.lemma)) ?? []
  if (matches.length) lemmaMatches.push({
    base_entry_id: entry.entry_id,
    base_lemma: entry.lemma,
    base_reviewed_at: entry.provenance?.reviewed_at ?? null,
    staging: matches.map((candidate) => ({ entry_id: candidate.entry_id, lemma: candidate.lemma, translations: candidate.senses?.flatMap((sense) => sense.translations ?? []) ?? [] }))
  })
}

const excluded = maps.flatMap(({ name, data }) => (data.excluded ?? []).map((item) => ({ source_map: name, ...item })))
const nonIncludedKeys = [...new Set(excluded.flatMap((item) => Object.keys(item)))].sort()
const reconciliationLike = excluded.filter((item) => /recon|doubl|déjà|deja|existing|canon|certif|duplicate/iu.test(`${item.reason ?? ''} ${JSON.stringify(item)}`))

const report = {
  base_count: base.length,
  staging_count: staging.length,
  uuid_overlap_count: staging.filter((entry) => base.some((current) => current.entry_id === entry.entry_id)).length,
  exact_lemma_overlap_count: lemmaMatches.length,
  exact_lemma_overlaps: lemmaMatches,
  source_map_count: maps.length,
  excluded_count: excluded.length,
  excluded_object_keys: nonIncludedKeys,
  reconciliation_like_count: reconciliationLike.length,
  reconciliation_like: reconciliationLike,
  excluded: excluded
}
console.log('A1_PROMOTION_DIAGNOSTIC_BEGIN')
console.log(JSON.stringify(report, null, 2))
console.log('A1_PROMOTION_DIAGNOSTIC_END')
