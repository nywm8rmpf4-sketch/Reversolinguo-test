#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const canonicalThemes = new Set([
  'identite', 'famille-relations', 'maison', 'ecole-etudes', 'travail-metiers',
  'alimentation', 'voyage', 'ville-services', 'corps-sante', 'vetements', 'temps',
  'meteo', 'loisirs', 'sports', 'culture-fetes', 'communication', 'numerique',
  'nature-environnement', 'description', 'espace-orientation'
])

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function scalar(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim() : ''
}

function parseJson(text, label) {
  try { return JSON.parse(text) } catch { throw new Error(`${label}_JSON_INVALID`) }
}

function normalizedGrade(value) {
  const grade = scalar(value)
  if (grade === '6e (bilangue)') return '6e'
  if (['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale'].includes(grade)) return grade
  throw new Error(`INVALID_SCHOOL_GRADE:${grade || '<missing>'}`)
}

function count(values) {
  const result = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

function sameObject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function runtimeTheme(entry, aliases) {
  if (!Array.isArray(entry.themes) || entry.themes.length === 0) throw new Error(`ENTRY_WITHOUT_THEME:${entry.entry_id}`)
  for (const rawTheme of entry.themes) {
    const raw = scalar(rawTheme)
    const mapped = scalar(aliases?.[raw] ?? raw)
    if (canonicalThemes.has(mapped)) return mapped
  }
  throw new Error(`ENTRY_WITHOUT_CANONICAL_THEME:${entry.entry_id}`)
}

function sourceCountKey(track, grade) {
  return `${track}:${grade}`
}

export function compileSchoolProjection({ catalogText, sourceManifestText, sourceManifestRepoPath }) {
  const catalog = parseJson(catalogText, 'CATALOG')
  const source = parseJson(sourceManifestText, 'SOURCE_MANIFEST')
  if (!Array.isArray(catalog)) throw new Error('CATALOG_NOT_ARRAY')
  if (source.schema_version !== '1.1') throw new Error(`SOURCE_SCHEMA_UNSUPPORTED:${source.schema_version}`)
  if (source.catalog_id !== 'fr-es-a1') throw new Error(`SOURCE_CATALOG_ID_INVALID:${source.catalog_id}`)
  if (sha256(catalogText) !== source.catalog_sha256) throw new Error('CATALOG_SHA256_MISMATCH')
  if (catalog.length !== source.catalog_entry_count) throw new Error(`CATALOG_ENTRY_COUNT_MISMATCH:${catalog.length}/${source.catalog_entry_count}`)

  const entryIds = catalog.map((entry) => scalar(entry.entry_id))
  if (entryIds.some((entryId) => !entryId)) throw new Error('CATALOG_ENTRY_ID_MISSING')
  if (new Set(entryIds).size !== entryIds.length) throw new Error('CATALOG_ENTRY_ID_DUPLICATE')

  const compact = source.compact_lossless_encoding
  if (!compact || typeof compact !== 'object') throw new Error('COMPACT_ENCODING_MISSING')
  const lvaCodes = scalar(compact.LVA_codes)
  const lvbCodes = scalar(compact.LVB_codes)
  if (lvaCodes.length !== catalog.length || lvbCodes.length !== catalog.length) {
    throw new Error(`CLASSIFICATION_LENGTH_MISMATCH:${lvaCodes.length}/${lvbCodes.length}/${catalog.length}`)
  }
  if (sha256(`${lvaCodes}\n${lvbCodes}\n`) !== compact.codes_sha256) throw new Error('CLASSIFICATION_CODES_SHA256_MISMATCH')

  const lvaLegend = compact.LVA_legend ?? {}
  const lvbLegend = compact.LVB_legend ?? {}
  const aliases = source.runtime_projection?.theme_aliases ?? {}
  const assignments = []

  for (let index = 0; index < catalog.length; index += 1) {
    const entry = catalog[index]
    const entryId = entryIds[index]
    const theme = runtimeTheme(entry, aliases)
    const lvaSource = scalar(lvaLegend[lvaCodes[index]])
    const lvbSource = scalar(lvbLegend[lvbCodes[index]])
    if (!lvaSource) throw new Error(`LVA_CODE_UNMAPPED:${index}:${lvaCodes[index]}`)
    if (!lvbSource) throw new Error(`LVB_CODE_UNMAPPED:${index}:${lvbCodes[index]}`)
    const sourceId = `SRC-A1-${entryId}`
    assignments.push({ review_id: sourceId, entry_id: entryId, track: 'LVA', grade: normalizedGrade(lvaSource), theme })
    assignments.push({ review_id: sourceId, entry_id: entryId, track: 'LVB', grade: normalizedGrade(lvbSource), theme })
  }

  const directCounts = count(assignments.map((assignment) => sourceCountKey(assignment.track, assignment.grade)))
  const expectedDirectCounts = {
    'LVA:5e': source.school_classifications?.LVA?.['5e'] ?? 0,
    'LVA:6e': source.school_classifications?.LVA?.['6e'] ?? 0,
    'LVB:4e': source.school_classifications?.LVB?.['4e'] ?? 0,
    'LVB:5e': source.school_classifications?.LVB?.['5e'] ?? 0,
    'LVB:6e': source.school_classifications?.LVB?.['6e (bilangue)'] ?? source.school_classifications?.LVB?.['6e_bilangue'] ?? 0
  }
  if (!sameObject(directCounts, expectedDirectCounts)) {
    throw new Error(`SCHOOL_COUNT_MISMATCH:${JSON.stringify(directCounts)}/${JSON.stringify(expectedDirectCounts)}`)
  }

  const entryIdSet = new Set(entryIds)
  const themePaths = Array.isArray(source.theme_path_assignments) ? source.theme_path_assignments.map((assignment) => ({ ...assignment })) : []
  const themePathKeys = new Set()
  for (const assignment of themePaths) {
    if (!entryIdSet.has(assignment.entry_id)) throw new Error(`THEME_PATH_UNKNOWN_ENTRY:${assignment.entry_id}`)
    if (!canonicalThemes.has(assignment.theme)) throw new Error(`THEME_PATH_UNKNOWN_THEME:${assignment.theme}`)
    if (!scalar(assignment.path_id) || !scalar(assignment.cefr_level)) throw new Error('THEME_PATH_INVALID')
    const key = `${assignment.path_id}:${assignment.cefr_level}:${assignment.entry_id}`
    if (themePathKeys.has(key)) throw new Error(`THEME_PATH_DUPLICATE:${key}`)
    themePathKeys.add(key)
  }

  const repoPath = scalar(sourceManifestRepoPath)
  if (!repoPath) throw new Error('SOURCE_MANIFEST_REPO_PATH_MISSING')
  const projection = {
    schema_version: '1.0',
    catalog_id: source.catalog_id,
    catalog_version: scalar(source.runtime_projection?.catalog_version),
    source: { artifact: repoPath, sha256: sha256(sourceManifestText) },
    school_source_assignments: assignments,
    theme_path_assignments: themePaths,
    source_counts: {
      school: directCounts,
      theme_paths: count(themePaths.map((assignment) => `${assignment.path_id}:${assignment.cefr_level}`))
    }
  }
  if (!projection.catalog_version) throw new Error('PROJECTION_CATALOG_VERSION_MISSING')
  return `${JSON.stringify(projection, null, 2)}\n`
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`UNEXPECTED_ARGUMENT:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`MISSING_ARGUMENT_VALUE:${token}`)
    args[token.slice(2)] = value
    index += 1
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.catalog || !args.source || !args.output) throw new Error('USAGE: --catalog <catalog.json> --source <SOURCE_MANIFEST.json> --output <runtime-projection.json>')
  const catalogPath = resolve(ROOT, args.catalog)
  const sourcePath = resolve(ROOT, args.source)
  const outputPath = resolve(ROOT, args.output)
  const projectionText = compileSchoolProjection({
    catalogText: readFileSync(catalogPath, 'utf8'),
    sourceManifestText: readFileSync(sourcePath, 'utf8'),
    sourceManifestRepoPath: relative(ROOT, sourcePath).replaceAll('\\', '/')
  })
  writeFileSync(outputPath, projectionText, 'utf8')
  process.stdout.write(`${JSON.stringify({ result: 'PASS', output: relative(ROOT, outputPath).replaceAll('\\', '/'), projection_sha256: sha256(projectionText) })}\n`)
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try { main() } catch (error) {
    process.stderr.write(`SCHOOL_PROJECTION_COMPILE_FAIL: ${error.message}\n`)
    process.exitCode = 2
  }
}
