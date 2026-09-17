#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const grades = new Set(['6e', '5e', '4e', '3e', 'seconde', 'premiere', 'terminale'])
const tracks = new Set(['LVA', 'LVB', 'LVC'])
const canonicalThemes = new Set([
  'identite', 'famille-relations', 'maison', 'ecole-etudes', 'travail-metiers',
  'alimentation', 'voyage', 'ville-services', 'corps-sante', 'vetements', 'temps',
  'meteo', 'loisirs', 'sports', 'culture-fetes', 'communication', 'numerique',
  'nature-environnement', 'description', 'espace-orientation'
])

function hash(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function counts(values) {
  const result = {}
  for (const value of values) result[value] = (result[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)))
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function inspectCatalogBundle({ catalogText, projectionText, manifestText }) {
  const errors = []
  let catalog
  let projection
  let manifest
  try { catalog = JSON.parse(catalogText) } catch { errors.push('catalog-json-invalid') }
  try { projection = JSON.parse(projectionText) } catch { errors.push('projection-json-invalid') }
  try { manifest = JSON.parse(manifestText) } catch { errors.push('manifest-json-invalid') }
  if (errors.length > 0) return { valid: false, errors }

  if (!Array.isArray(catalog)) errors.push('catalog-not-array')
  if (!projection || projection.schema_version !== '1.0') errors.push('projection-schema-version')
  if (!manifest || typeof manifest.catalog_id !== 'string' || typeof manifest.catalog_version !== 'string') errors.push('manifest-contract')
  if (errors.length > 0) return { valid: false, errors }

  const ids = new Set()
  for (const [index, entry] of catalog.entries()) {
    if (!entry || typeof entry.entry_id !== 'string') errors.push(`catalog-entry-id:${index}`)
    else if (ids.has(entry.entry_id)) errors.push(`catalog-duplicate-id:${entry.entry_id}`)
    else ids.add(entry.entry_id)
  }

  if (projection.catalog_id !== manifest.catalog_id) errors.push(`projection-catalog-id:${projection.catalog_id}`)
  if (projection.catalog_version !== manifest.catalog_version) errors.push(`projection-catalog-version:${projection.catalog_version}`)
  if (!Array.isArray(projection.school_source_assignments)) errors.push('projection-school-not-array')
  if (!Array.isArray(projection.theme_path_assignments)) errors.push('projection-theme-path-not-array')
  if (!projection.source_counts || typeof projection.source_counts !== 'object') errors.push('projection-source-counts')

  if (errors.length === 0) {
    const sourceKeys = new Set()
    const relationThemes = new Map()
    for (const assignment of projection.school_source_assignments) {
      if (!ids.has(assignment.entry_id)) errors.push(`school-unknown-entry:${assignment.entry_id}`)
      if (!tracks.has(assignment.track)) errors.push(`school-invalid-track:${assignment.track}`)
      if (!grades.has(assignment.grade)) errors.push(`school-invalid-grade:${assignment.grade}`)
      if (!canonicalThemes.has(assignment.theme)) errors.push(`school-unknown-theme:${assignment.theme}`)
      const sourceKey = `${assignment.review_id}:${assignment.track}`
      if (sourceKeys.has(sourceKey)) errors.push(`school-duplicate-source:${sourceKey}`)
      sourceKeys.add(sourceKey)
      const relationKey = `${assignment.track}:${assignment.grade}:${assignment.entry_id}`
      const previousTheme = relationThemes.get(relationKey)
      if (previousTheme && previousTheme !== assignment.theme) errors.push(`school-conflicting-theme:${relationKey}`)
      else relationThemes.set(relationKey, assignment.theme)
    }

    const pathKeys = new Set()
    for (const assignment of projection.theme_path_assignments) {
      if (!ids.has(assignment.entry_id)) errors.push(`theme-path-unknown-entry:${assignment.entry_id}`)
      if (!canonicalThemes.has(assignment.theme)) errors.push(`theme-path-unknown-theme:${assignment.theme}`)
      const key = `${assignment.path_id}:${assignment.cefr_level}:${assignment.entry_id}`
      if (pathKeys.has(key)) errors.push(`theme-path-duplicate:${key}`)
      pathKeys.add(key)
    }

    const expectedSchoolCounts = counts(projection.school_source_assignments.map((assignment) => `${assignment.track}:${assignment.grade}`))
    const expectedThemeCounts = counts(projection.theme_path_assignments.map((assignment) => `${assignment.path_id}:${assignment.cefr_level}`))
    if (!equalJson(expectedSchoolCounts, projection.source_counts.school ?? {})) errors.push('school-source-count-mismatch')
    if (!equalJson(expectedThemeCounts, projection.source_counts.theme_paths ?? {})) errors.push('theme-path-source-count-mismatch')
  }

  const derivedManifest = {
    ...manifest,
    entry_count: catalog.length,
    catalog_sha256: hash(catalogText),
    projection_sha256: hash(projectionText)
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    derived_manifest: derivedManifest,
    catalog_entry_count: catalog.length,
    catalog_sha256: derivedManifest.catalog_sha256,
    projection_sha256: derivedManifest.projection_sha256
  }
}

export function prepareCatalogBundle({ catalogPath, projectionPath, manifestPath, check = false }) {
  const catalogText = readFileSync(catalogPath, 'utf8')
  const projectionText = readFileSync(projectionPath, 'utf8')
  const manifestText = readFileSync(manifestPath, 'utf8')
  const result = inspectCatalogBundle({ catalogText, projectionText, manifestText })
  if (!result.valid) throw new Error(`CATALOG_BUNDLE_INVALID:${result.errors.join('|')}`)

  const currentManifest = JSON.parse(manifestText)
  if (check) {
    if (!equalJson(currentManifest, result.derived_manifest)) throw new Error('CATALOG_MANIFEST_DERIVED_FIELDS_STALE')
    return result
  }

  writeFileSync(manifestPath, `${JSON.stringify(result.derived_manifest, null, 2)}\n`, 'utf8')
  return result
}

function parseArgs(argv) {
  const options = { check: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--check') {
      options.check = true
      continue
    }
    if (!token.startsWith('--')) throw new Error(`UNEXPECTED_ARGUMENT:${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`MISSING_ARGUMENT_VALUE:${token}`)
    options[token.slice(2)] = value
    index += 1
  }
  return options
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalog = args.catalog ?? 'catalogs/fr-es/a1/catalog.json'
  const projection = args.projection ?? 'catalogs/fr-es/a1/runtime-projection.json'
  const manifest = args.manifest ?? 'catalogs/fr-es/a1/manifest.json'
  const result = prepareCatalogBundle({
    catalogPath: resolve(ROOT, catalog),
    projectionPath: resolve(ROOT, projection),
    manifestPath: resolve(ROOT, manifest),
    check: args.check
  })
  process.stdout.write(`${JSON.stringify({
    result: 'PASS',
    check: args.check,
    entry_count: result.catalog_entry_count,
    catalog_sha256: result.catalog_sha256,
    projection_sha256: result.projection_sha256
  })}\n`)
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedAsScript) {
  try { main() } catch (error) {
    process.stderr.write(`CATALOG_BUNDLE_FAIL: ${error.message}\n`)
    process.exitCode = 2
  }
}
