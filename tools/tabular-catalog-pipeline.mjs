#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const UUID_NAMESPACE = '34e33fa1-c411-4168-8e5d-107cf91361cb'
const LEVELS = ['PRE-A1', 'A1', 'A2', 'B1', 'B2']
const GRADES = new Set(['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale'])
const THEMES = new Set([
  'identite', 'famille-relations', 'maison', 'ecole-etudes', 'travail-metiers',
  'alimentation', 'voyage', 'ville-services', 'corps-sante', 'vetements', 'temps',
  'meteo', 'loisirs', 'sports', 'culture-fetes', 'communication', 'numerique',
  'nature-environnement', 'description', 'espace-orientation'
])
const TYPE_MAP = {
  nom: 'noun', verbe: 'verb', adjectif: 'adjective', adverbe: 'adverb',
  expression: 'expression', formule: 'expression', locution: 'expression',
  interjection: 'expression', conjonction: 'connector', connecteur: 'connector',
  'préposition': 'other', preposition: 'other', pronom: 'other',
  'déterminant': 'other', determinant: 'other', article: 'other',
  'numéral': 'other', numeral: 'other', nombre: 'other', autre: 'other'
}

export const CANONICAL_COLUMNS = [
  'review_id', 'spanish', 'french', 'sense_key', 'type', 'theme', 'subtheme',
  'relation', 'rationale', 'cefr_level', 'school_lva', 'school_lvb',
  'reversolinguo_sublevel', 'intra_cefr_index', 'confidence_lva', 'confidence_lvb',
  'review_status', 'note', 'source_url', 'example_source', 'example_target', 'variety',
  'existing_identity_decision', 'prompt_context_fr_es', 'prompt_context_es_fr',
  'path_id', 'path_level'
]

function text(value) {
  return String(value ?? '').normalize('NFC').trim()
}

function key(value) {
  return text(value).toLocaleLowerCase('es')
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function count(values) {
  const result = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

function uuidBytes(uuid) {
  const hex = uuid.replaceAll('-', '')
  if (!/^[0-9a-f]{32}$/iu.test(hex)) throw new Error(`INVALID_UUID_NAMESPACE:${uuid}`)
  return Buffer.from(hex, 'hex')
}

function uuidV5(namespace, name) {
  const digest = createHash('sha1').update(Buffer.concat([uuidBytes(namespace), Buffer.from(name, 'utf8')])).digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function identityName(sourceLanguage, targetLanguage, lemma, senseKey = '') {
  const parts = ['reversolinguo-lexical-v1', key(sourceLanguage), key(targetLanguage), key(lemma)]
  if (text(senseKey)) parts.push(`sense:${key(senseKey)}`)
  return parts.join('|')
}

function semanticKey(languageTag, lemma, senseKey = '') {
  const base = `${key(languageTag)}:${key(lemma)}`
  return text(senseKey) ? `${base}:sense:${key(senseKey)}` : base
}

function normalizedGrade(value) {
  const raw = text(value)
  if (raw === '6e (bilangue)' || raw === '6e_bilangue') return '6e'
  const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('fr')
  if (GRADES.has(folded)) return folded
  throw new Error(`INVALID_SCHOOL_GRADE:${raw || '<missing>'}`)
}

function translations(value) {
  return [...new Set(text(value).split(';').map(text).filter(Boolean))]
}

function unresolvedStatus(value) {
  const normalized = key(value)
  return normalized.includes('arbitrage') || normalized.includes('moderniser')
}

function parseCsvRecords(input) {
  const source = input.startsWith('\uFEFF') ? input.slice(1) : input
  const records = []
  let record = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      if (field.length !== 0) throw new Error('CSV_QUOTE_IN_UNQUOTED_FIELD')
      quoted = true
    } else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else if (char === '\r') {
      if (source[index + 1] === '\n') index += 1
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('CSV_UNCLOSED_QUOTE')
  if (field.length > 0 || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records.filter((row) => row.some((value) => value !== ''))
}

export function parseCanonicalCsv(csvText) {
  const records = parseCsvRecords(csvText)
  if (records.length < 2) throw new Error('CSV_EMPTY')
  const header = records[0].map(text)
  if (new Set(header).size !== header.length) throw new Error('CSV_DUPLICATE_HEADER')
  const missing = CANONICAL_COLUMNS.filter((column) => !header.includes(column))
  const unknown = header.filter((column) => !CANONICAL_COLUMNS.includes(column))
  if (missing.length || unknown.length) {
    throw new Error(`CSV_HEADER_CONTRACT:missing=${missing.join(';')}:unknown=${unknown.join(';')}`)
  }
  return records.slice(1).map((values, rowIndex) => {
    if (values.length !== header.length) throw new Error(`CSV_COLUMN_COUNT:${rowIndex + 2}`)
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']))
  })
}

function csvCell(value) {
  const scalar = String(value ?? '').normalize('NFC')
  return /[",\r\n]/u.test(scalar) ? `"${scalar.replaceAll('"', '""')}"` : scalar
}

export function serializeCanonicalCsv(rows) {
  const lines = [CANONICAL_COLUMNS.join(',')]
  for (const row of rows) lines.push(CANONICAL_COLUMNS.map((column) => csvCell(row[column] ?? '')).join(','))
  return `${lines.join('\n')}\n`
}

export function canonicalizeCsv(csvText) {
  return serializeCanonicalCsv(parseCanonicalCsv(csvText))
}

function lexicalSchemaValidator() {
  const schema = JSON.parse(readFileSync(resolve(ROOT, 'src/content/schemas/lexical-entry.schema.json'), 'utf8'))
  const ajv = new Ajv({ allErrors: true, strict: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

function promptGroups(entries, side) {
  const groups = new Map()
  for (const entry of entries) {
    if (entry.status === 'withdrawn') continue
    const sense = entry.senses?.[0]
    if (!sense) continue
    const prompt = side === 'source' ? entry.lemma : sense.translations?.[0]
    const answers = side === 'source' ? sense.translations : [entry.lemma]
    if (!text(prompt) || !Array.isArray(answers) || answers.length === 0) continue
    const promptKey = key(prompt)
    const item = { entry, answerSignature: answers.map(key).sort().join('\u001f') }
    const current = groups.get(promptKey) ?? []
    current.push(item)
    groups.set(promptKey, current)
  }
  return groups
}

function ambiguousMembership(entries, side) {
  const result = new Map()
  for (const [prompt, items] of promptGroups(entries, side)) {
    if (new Set(items.map((item) => item.answerSignature)).size <= 1) continue
    result.set(prompt, items.map((item) => item.entry.entry_id).sort())
  }
  return result
}

function sameMembers(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function validateNewPromptCollisions(baseline, cumulative, contexts, exceptions) {
  for (const side of ['source', 'target']) {
    const direction = side === 'source' ? 'es-fr' : 'fr-es'
    const before = ambiguousMembership(baseline, side)
    const after = ambiguousMembership(cumulative, side)
    const groups = promptGroups(cumulative, side)
    for (const [prompt, members] of after) {
      if (sameMembers(before.get(prompt), members)) continue
      const items = groups.get(prompt) ?? []
      const cueValues = []
      for (const item of items) {
        const cue = text(contexts[item.entry.entry_id]?.[direction])
        if (!cue) {
          exceptions.push(`prompt-collision:${direction}:${prompt}:missing-explicit-cue:${item.entry.entry_id}`)
          continue
        }
        const expected = side === 'source' ? item.entry.senses[0].translations : [item.entry.lemma]
        if (expected.some((answer) => key(cue).includes(key(answer)))) {
          exceptions.push(`prompt-collision:${direction}:${prompt}:cue-leaks-answer:${item.entry.entry_id}`)
        }
        cueValues.push(key(cue))
      }
      if (cueValues.length === items.length && new Set(cueValues).size !== cueValues.length) {
        exceptions.push(`prompt-collision:${direction}:${prompt}:cues-not-unique`)
      }
    }
  }
}

function sortedPromptContexts(contexts) {
  const result = {}
  for (const entryId of Object.keys(contexts).sort()) {
    const source = contexts[entryId] ?? {}
    const directions = {}
    for (const direction of ['fr-es', 'es-fr']) {
      if (text(source[direction])) directions[direction] = text(source[direction])
    }
    if (Object.keys(directions).length) result[entryId] = directions
  }
  return result
}

function manifestErrors(source, csvText, rowCount) {
  const errors = []
  if (source.schema_version !== '1.0') errors.push('source-manifest-schema')
  for (const field of ['archive_id', 'catalog_id', 'catalog_version', 'source_language', 'target_language', 'cefr_level', 'license', 'authored_by']) {
    if (!text(source[field])) errors.push(`source-manifest-missing:${field}`)
  }
  if (!LEVELS.includes(source.cefr_level)) errors.push(`source-manifest-level:${source.cefr_level}`)
  if (!text(source.source_excel?.filename) || !/^[0-9a-f]{64}$/u.test(text(source.source_excel?.sha256))) errors.push('source-excel-identity')
  if (!/^[0-9a-f]{64}$/u.test(text(source.canonical_csv?.sha256))) errors.push('canonical-csv-hash-contract')
  else if (sha256(csvText) !== source.canonical_csv.sha256) errors.push('canonical-csv-sha256-mismatch')
  if (!Number.isInteger(source.expected_source_rows) || source.expected_source_rows !== rowCount) {
    errors.push(`source-row-count:${rowCount}/${source.expected_source_rows}`)
  }
  if (!Array.isArray(source.required_tracks) || source.required_tracks.length === 0 || source.required_tracks.some((track) => !['LVA', 'LVB'].includes(track))) {
    errors.push('source-required-tracks')
  }
  return errors
}

export function runTabularCatalogPipeline({
  csvText,
  sourceManifestText,
  sourceManifestRepoPath,
  baselineCatalogText,
  baselineProjectionText,
  baselineManifestText
}) {
  const exceptions = []
  let rows
  let source
  let baselineCatalog
  let baselineProjection
  let baselineManifest
  try {
    rows = parseCanonicalCsv(csvText)
    source = JSON.parse(sourceManifestText)
    baselineCatalog = JSON.parse(baselineCatalogText)
    baselineProjection = JSON.parse(baselineProjectionText)
    baselineManifest = JSON.parse(baselineManifestText)
  } catch (error) {
    return { valid: false, exceptions: [`parse:${error.message}`] }
  }

  if (serializeCanonicalCsv(rows) !== csvText) exceptions.push('csv-not-canonical')
  exceptions.push(...manifestErrors(source, csvText, rows.length))
  if (!Array.isArray(baselineCatalog)) exceptions.push('baseline-catalog-not-array')
  if (baselineProjection.catalog_id !== baselineManifest.catalog_id) exceptions.push('baseline-projection-catalog-id')
  if (baselineProjection.catalog_version !== baselineManifest.catalog_version) exceptions.push('baseline-projection-version')
  if (sha256(baselineCatalogText) !== baselineManifest.catalog_sha256) exceptions.push('baseline-catalog-hash')
  if (sha256(baselineProjectionText) !== baselineManifest.projection_sha256) exceptions.push('baseline-projection-hash')
  if (exceptions.length) return { valid: false, exceptions: [...new Set(exceptions)].sort() }

  const validateEntry = lexicalSchemaValidator()
  const existingBySemantic = new Map()
  const existingIds = new Set()
  for (const entry of baselineCatalog) {
    existingIds.add(entry.entry_id)
    const identity = semanticKey(entry.language_tag, entry.lemma, entry.sense_key)
    if (existingBySemantic.has(identity)) exceptions.push(`baseline-semantic-duplicate:${identity}`)
    existingBySemantic.set(identity, entry)
  }

  const reviewIds = new Set()
  const sourceSemantics = new Set()
  const newEntries = []
  const reviewToEntry = new Map()
  const contexts = {}
  for (const contextSource of [baselineProjection.prompt_contexts ?? {}, source.prompt_contexts ?? {}]) {
    for (const [entryId, directions] of Object.entries(contextSource)) {
      contexts[entryId] = { ...(contexts[entryId] ?? {}), ...(directions ?? {}) }
    }
  }

  for (const [index, raw] of rows.entries()) {
    const row = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, text(value)]))
    const prefix = `row:${index + 2}`
    const reviewId = row.review_id
    if (!reviewId) exceptions.push(`${prefix}:missing-review-id`)
    else if (reviewIds.has(reviewId)) exceptions.push(`${prefix}:duplicate-review-id:${reviewId}`)
    else reviewIds.add(reviewId)

    for (const [field, value] of [['spanish', row.spanish], ['french', row.french], ['type', row.type], ['theme', row.theme], ['rationale', row.rationale], ['cefr_level', row.cefr_level], ['review_status', row.review_status], ['example_source', row.example_source], ['example_target', row.example_target]]) {
      if (!text(value)) exceptions.push(`${prefix}:missing-${field}`)
    }
    if (row.cefr_level !== source.cefr_level) exceptions.push(`${prefix}:level-mismatch:${row.cefr_level}/${source.cefr_level}`)
    if (unresolvedStatus(row.review_status)) exceptions.push(`${prefix}:unresolved-status:${row.review_status}`)
    const partOfSpeech = TYPE_MAP[key(row.type)]
    if (!partOfSpeech) exceptions.push(`${prefix}:unsupported-type:${row.type}`)
    if (!THEMES.has(row.theme)) exceptions.push(`${prefix}:unknown-theme:${row.theme}`)
    const rowTranslations = translations(row.french)
    if (!rowTranslations.length) exceptions.push(`${prefix}:missing-translation`)

    for (const track of source.required_tracks ?? []) {
      const value = track === 'LVA' ? row.school_lva : row.school_lvb
      if (!text(value)) exceptions.push(`${prefix}:missing-school-${track.toLowerCase()}`)
      else {
        try { normalizedGrade(value) } catch (error) { exceptions.push(`${prefix}:${error.message}`) }
      }
    }

    const identity = semanticKey(source.source_language, row.spanish, row.sense_key)
    if (sourceSemantics.has(identity)) exceptions.push(`${prefix}:duplicate-source-semantic:${identity}`)
    sourceSemantics.add(identity)

    const existing = existingBySemantic.get(identity)
    let entryId
    if (existing) {
      entryId = existing.entry_id
      const existingTranslations = (existing.senses?.[0]?.translations ?? []).map(key).sort()
      const incomingTranslations = rowTranslations.map(key).sort()
      if (JSON.stringify(existingTranslations) !== JSON.stringify(incomingTranslations) && key(row.existing_identity_decision) !== 'reuse') {
        exceptions.push(`${prefix}:existing-translation-conflict:${reviewId}:${entryId}`)
      }
    } else {
      entryId = uuidV5(UUID_NAMESPACE, identityName(source.source_language, source.target_language, row.spanish, row.sense_key))
      if (existingIds.has(entryId)) exceptions.push(`${prefix}:uuid-collision:${entryId}`)
      existingIds.add(entryId)
      const entry = {
        entry_id: entryId,
        language_tag: text(source.source_language),
        lemma: row.spanish,
        ...(row.sense_key ? { sense_key: key(row.sense_key) } : {}),
        part_of_speech: partOfSpeech ?? 'other',
        senses: [{
          sense_id: 's1',
          translations: rowTranslations,
          example_source: row.example_source,
          example_target: row.example_target,
          ...(row.note ? { note: row.note } : {})
        }],
        cefr_level: row.cefr_level,
        cefr_rationale: row.rationale,
        themes: [row.theme],
        ...(row.variety ? { variety: row.variety } : {}),
        provenance: {
          source: `Reversolinguo approved tabular source ${source.archive_id}`,
          license: source.license,
          authored_by: source.authored_by
        },
        status: 'draft',
        version: 1
      }
      if (!validateEntry(entry)) {
        const detail = (validateEntry.errors ?? []).map((error) => `${error.instancePath || '/'}:${error.keyword}`).join(',')
        exceptions.push(`${prefix}:entry-schema:${detail}`)
      }
      newEntries.push(entry)
    }
    reviewToEntry.set(reviewId, entryId)

    const cue = contexts[entryId] ? { ...contexts[entryId] } : {}
    if (row.prompt_context_fr_es) cue['fr-es'] = row.prompt_context_fr_es
    if (row.prompt_context_es_fr) cue['es-fr'] = row.prompt_context_es_fr
    if (Object.keys(cue).length) contexts[entryId] = cue
  }

  if (exceptions.length) return { valid: false, exceptions: [...new Set(exceptions)].sort() }

  const cumulativeCatalog = [...baselineCatalog, ...newEntries]
  const cumulativeIds = new Set(cumulativeCatalog.map((entry) => entry.entry_id))
  for (const entryId of Object.keys(contexts)) {
    if (!cumulativeIds.has(entryId)) exceptions.push(`prompt-context-unknown-entry:${entryId}`)
  }
  validateNewPromptCollisions(baselineCatalog, cumulativeCatalog, contexts, exceptions)

  const school = [...(baselineProjection.school_source_assignments ?? [])]
  const themePaths = [...(baselineProjection.theme_path_assignments ?? [])]
  for (const row of rows) {
    const reviewId = text(row.review_id)
    const entryId = reviewToEntry.get(reviewId)
    if (!entryId) {
      exceptions.push(`projection-unresolved-entry:${reviewId}`)
      continue
    }
    for (const track of ['LVA', 'LVB']) {
      const rawGrade = track === 'LVA' ? text(row.school_lva) : text(row.school_lvb)
      if (!rawGrade) continue
      let grade
      try { grade = normalizedGrade(rawGrade) } catch (error) {
        exceptions.push(`projection:${reviewId}:${error.message}`)
        continue
      }
      school.push({ review_id: reviewId, entry_id: entryId, track, grade, theme: text(row.theme) })
    }
    const pathId = text(row.path_id)
    const pathLevel = text(row.path_level)
    if ((pathId && !pathLevel) || (!pathId && pathLevel)) exceptions.push(`projection:${reviewId}:incomplete-theme-path`)
    if (pathId && pathLevel) themePaths.push({ entry_id: entryId, path_id: pathId, cefr_level: pathLevel, theme: text(row.theme) })
  }

  const projection = {
    schema_version: '1.0',
    catalog_id: source.catalog_id,
    catalog_version: source.catalog_version,
    source: { artifact: sourceManifestRepoPath, sha256: sha256(sourceManifestText) },
    prompt_contexts: sortedPromptContexts(contexts),
    school_source_assignments: school,
    theme_path_assignments: themePaths,
    source_counts: {
      school: count(school.map((assignment) => `${assignment.track}:${assignment.grade}`)),
      theme_paths: count(themePaths.map((assignment) => `${assignment.path_id}:${assignment.cefr_level}`))
    }
  }

  const seenSchool = new Set()
  for (const assignment of school) {
    if (!cumulativeCatalog.some((entry) => entry.entry_id === assignment.entry_id)) exceptions.push(`projection-unknown-entry:${assignment.entry_id}`)
    const sourceKey = `${assignment.review_id}:${assignment.track}`
    if (seenSchool.has(sourceKey)) exceptions.push(`projection-duplicate-source:${sourceKey}`)
    seenSchool.add(sourceKey)
  }

  const seenPaths = new Set()
  for (const assignment of themePaths) {
    const pathKey = `${assignment.path_id}:${assignment.cefr_level}:${assignment.entry_id}`
    if (seenPaths.has(pathKey)) exceptions.push(`projection-duplicate-theme-path:${pathKey}`)
    seenPaths.add(pathKey)
    if (!cumulativeIds.has(assignment.entry_id)) exceptions.push(`projection-theme-path-unknown-entry:${assignment.entry_id}`)
  }

  if (exceptions.length) return { valid: false, exceptions: [...new Set(exceptions)].sort() }

  const catalogText = stableJson(cumulativeCatalog)
  const projectionText = stableJson(projection)
  const manifest = {
    catalog_id: source.catalog_id,
    catalog_version: source.catalog_version,
    source_language: source.source_language,
    target_language: source.target_language,
    cefr_level: source.cefr_level,
    entry_count: cumulativeCatalog.length,
    license: source.license,
    schema_id: 'https://reversolinguo.app/schemas/lexical-entry-v2.json',
    min_app_version: text(source.min_app_version || baselineManifest.min_app_version),
    catalog_sha256: sha256(catalogText),
    projection_sha256: sha256(projectionText),
    status: 'draft-human-review',
    human_review: 'NOT_EXECUTED'
  }
  const manifestText = stableJson(manifest)
  return {
    valid: true,
    exceptions: [],
    outputs: { catalogText, projectionText, manifestText },
    report: {
      result: 'PASS',
      source_rows: rows.length,
      new_entries: newEntries.length,
      reconciled_entries: rows.length - newEntries.length,
      cumulative_entries: cumulativeCatalog.length,
      catalog_sha256: manifest.catalog_sha256,
      projection_sha256: manifest.projection_sha256,
      data_only_paths: [
        'public/catalogs/runtime/catalog.json',
        'public/catalogs/runtime/runtime-projection.json',
        'public/catalogs/runtime/manifest.json'
      ]
    }
  }
}

function parseArgs(argv) {
  const [command = 'build', ...rest] = argv
  const args = {}
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) throw new Error(`UNEXPECTED_ARGUMENT:${token}`)
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`MISSING_ARGUMENT_VALUE:${token}`)
    args[token.slice(2)] = value
    index += 1
  }
  return { command, args }
}

function main() {
  const { command, args } = parseArgs(process.argv.slice(2))
  if (command === 'canonicalize') {
    if (!args.input || !args.output) throw new Error('USAGE: canonicalize --input <csv> --output <csv>')
    const canonical = canonicalizeCsv(readFileSync(resolve(ROOT, args.input), 'utf8'))
    writeFileSync(resolve(ROOT, args.output), canonical, 'utf8')
    process.stdout.write(`${JSON.stringify({ result: 'PASS', output: args.output, sha256: sha256(canonical) })}\n`)
    return
  }
  if (command !== 'build') throw new Error(`UNKNOWN_COMMAND:${command}`)
  for (const required of ['csv', 'source-manifest', 'baseline-dir', 'output-dir', 'exceptions']) {
    if (!args[required]) throw new Error(`MISSING_ARGUMENT:--${required}`)
  }
  const baseline = resolve(ROOT, args['baseline-dir'])
  const result = runTabularCatalogPipeline({
    csvText: readFileSync(resolve(ROOT, args.csv), 'utf8'),
    sourceManifestText: readFileSync(resolve(ROOT, args['source-manifest']), 'utf8'),
    sourceManifestRepoPath: args['source-manifest'],
    baselineCatalogText: readFileSync(resolve(baseline, 'catalog.json'), 'utf8'),
    baselineProjectionText: readFileSync(resolve(baseline, 'runtime-projection.json'), 'utf8'),
    baselineManifestText: readFileSync(resolve(baseline, 'manifest.json'), 'utf8')
  })
  const exceptionPath = resolve(ROOT, args.exceptions)
  mkdirSync(resolve(exceptionPath, '..'), { recursive: true })
  writeFileSync(exceptionPath, stableJson({
    result: result.valid ? 'PASS' : 'FAIL',
    exceptions: result.exceptions,
    ...(result.report ? { report: result.report } : {})
  }), 'utf8')
  if (!result.valid) {
    process.stderr.write(`TABULAR_CATALOG_PIPELINE_FAIL:${result.exceptions.join('|')}\n`)
    process.exitCode = 2
    return
  }
  const output = resolve(ROOT, args['output-dir'])
  mkdirSync(output, { recursive: true })
  writeFileSync(resolve(output, 'catalog.json'), result.outputs.catalogText, 'utf8')
  writeFileSync(resolve(output, 'runtime-projection.json'), result.outputs.projectionText, 'utf8')
  writeFileSync(resolve(output, 'manifest.json'), result.outputs.manifestText, 'utf8')
  process.stdout.write(`${JSON.stringify(result.report)}\n`)
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try { main() } catch (error) {
    process.stderr.write(`TABULAR_CATALOG_PIPELINE_ERROR:${error.message}\n`)
    process.exitCode = 2
  }
}
