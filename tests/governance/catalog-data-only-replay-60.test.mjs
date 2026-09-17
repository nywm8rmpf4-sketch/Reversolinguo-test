import assert from 'node:assert/strict'
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { inspectCatalogBundle, prepareCatalogBundle } from '../../tools/prepare-catalog-bundle.mjs'
import { classifyFiles, verifyCampaign } from '../../tools/qa-governance.mjs'
import { signManifestText } from '../../tools/sign-catalog-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HISTORICAL_BATCH_SIZE = 60

function buildProjection(entries, catalogVersion, sourceArtifact) {
  const [lvaEntry, lvbEntry, voyageEntry] = entries
  assert.ok(lvaEntry?.themes?.[0])
  assert.ok(lvbEntry?.themes?.[0])
  assert.ok(voyageEntry?.themes?.[0])
  return {
    schema_version: '1.0',
    catalog_id: 'fr-es-a1',
    catalog_version: catalogVersion,
    source: { artifact: sourceArtifact },
    school_source_assignments: [
      {
        review_id: 'TEST-ONLY-60-LVA',
        entry_id: lvaEntry.entry_id,
        track: 'LVA',
        grade: '6e',
        theme: lvaEntry.themes[0]
      },
      {
        review_id: 'TEST-ONLY-60-LVB',
        entry_id: lvbEntry.entry_id,
        track: 'LVB',
        grade: '6e',
        theme: lvbEntry.themes[0]
      }
    ],
    theme_path_assignments: [
      {
        entry_id: voyageEntry.entry_id,
        path_id: 'voyage',
        cefr_level: 'A1',
        theme: voyageEntry.themes[0]
      }
    ],
    source_counts: {
      school: { 'LVA:6e': 1, 'LVB:6e': 1 },
      theme_paths: { 'voyage:A1': 1 }
    }
  }
}

function buildBundle(entries, catalogVersion, sourceArtifact) {
  const catalogText = `${JSON.stringify(entries, null, 2)}\n`
  const projection = buildProjection(entries, catalogVersion, sourceArtifact)
  const projectionText = `${JSON.stringify(projection, null, 2)}\n`
  const manifestSeed = {
    catalog_id: 'fr-es-a1',
    catalog_version: catalogVersion,
    source_language: 'es',
    target_language: 'fr',
    cefr_level: 'A1',
    entry_count: 0,
    license: 'CC BY 4.0',
    schema_id: 'https://reversolinguo.app/schemas/lexical-entry-v2.json',
    min_app_version: '0.1.0',
    catalog_sha256: 'pending',
    projection_sha256: 'pending',
    status: 'test-only',
    human_review: 'NOT_APPLICABLE_TEST_ONLY'
  }
  const inspected = inspectCatalogBundle({
    catalogText,
    projectionText,
    manifestText: `${JSON.stringify(manifestSeed, null, 2)}\n`
  })
  assert.equal(inspected.valid, true, inspected.errors.join('|'))
  const manifestText = `${JSON.stringify(inspected.derived_manifest, null, 2)}\n`
  const checked = inspectCatalogBundle({ catalogText, projectionText, manifestText })
  assert.equal(checked.valid, true, checked.errors.join('|'))
  assert.deepEqual(checked.derived_manifest, JSON.parse(manifestText))
  return { catalogText, projectionText, manifestText }
}

function verifySignature(manifestText, signatureDocument, publicJwk) {
  const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' })
  return verify(
    'sha256',
    Buffer.from(manifestText, 'utf8'),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signatureDocument.signature_base64, 'base64')
  )
}

test('replays the historical 60-entry lot as a true data-only 59→60 update with one test key', () => {
  const liveCatalog = JSON.parse(readFileSync(resolve(ROOT, 'catalogs/fr-es/a1/catalog.json'), 'utf8'))
  assert.ok(liveCatalog.length >= HISTORICAL_BATCH_SIZE)

  // The original PACK-6B test lot is the first immutable 60-entry base that
  // later A1 macro promotion extended. This test reuses those exact entries;
  // it does not create or classify new product vocabulary.
  const historical60 = liveCatalog.slice(0, HISTORICAL_BATCH_SIZE)
  assert.equal(historical60.length, HISTORICAL_BATCH_SIZE)
  assert.equal(new Set(historical60.map((entry) => entry.entry_id)).size, HISTORICAL_BATCH_SIZE)

  const baseline59 = buildBundle(historical60.slice(0, 59), 'test-only-59', 'historical-pack6b-first-59')
  const update60 = buildBundle(historical60, 'test-only-60', 'historical-pack6b-60')

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privateJwk = privateKey.export({ format: 'jwk' })
  const exportedPublic = publicKey.export({ format: 'jwk' })
  const pinned = {
    key_id: 'TEST-ONLY-catalog-data-replay-60',
    jwk: {
      kty: exportedPublic.kty,
      crv: exportedPublic.crv,
      x: exportedPublic.x,
      y: exportedPublic.y,
      ext: true,
      key_ops: ['verify']
    }
  }

  const signature59 = signManifestText(baseline59.manifestText, privateJwk, pinned)
  const signature60 = signManifestText(update60.manifestText, privateJwk, pinned)
  assert.equal(signature59.key_id, pinned.key_id)
  assert.equal(signature60.key_id, pinned.key_id)
  assert.notEqual(signature59.signature_base64, signature60.signature_base64)
  assert.equal(verifySignature(baseline59.manifestText, signature59, pinned.jwk), true)
  assert.equal(verifySignature(update60.manifestText, signature60, pinned.jwk), true)

  const changedFiles = [
    'catalogs/fr-es/a1/catalog.json',
    'catalogs/fr-es/a1/runtime-projection.json',
    'catalogs/fr-es/a1/manifest.json',
    'catalogs/fr-es/a1/manifest.sig.json'
  ]
  const classification = classifyFiles(changedFiles)
  assert.equal(classification.validation_profile, 'RUNTIME_DATA_ONLY')
  const plan = verifyCampaign(classification, 'data-candidate/test-only-60-replay', 'runtime_data_targeted')
  assert.equal(plan.verdict, 'PASS')
  assert.equal(plan.produces_runtime_artifact, true)
  assert.deepEqual(plan.normally_excluded_controls, ['ACCESSIBILITY', 'E2E', 'OFFLINE'])
  for (const required of ['CATALOG_INTEGRITY', 'CATALOG_PROJECTION', 'UNIT', 'INTEGRATION', 'BUILD_RUNTIME', 'RUNTIME_ARTIFACT']) {
    assert.ok(plan.required_controls.includes(required), `missing required control ${required}`)
  }

  const temp = mkdtempSync(join(tmpdir(), 'reversolinguo-data-only-60-'))
  try {
    const catalogPath = join(temp, 'catalog.json')
    const projectionPath = join(temp, 'runtime-projection.json')
    const manifestPath = join(temp, 'manifest.json')
    writeFileSync(catalogPath, update60.catalogText, 'utf8')
    writeFileSync(projectionPath, update60.projectionText, 'utf8')
    writeFileSync(manifestPath, update60.manifestText, 'utf8')
    assert.doesNotThrow(() => prepareCatalogBundle({ catalogPath, projectionPath, manifestPath, check: true }))

    // Byte-level projection tampering must invalidate the manifest-derived hash
    // even when the JSON semantics are otherwise unchanged.
    writeFileSync(projectionPath, `${update60.projectionText}\n`, 'utf8')
    assert.throws(
      () => prepareCatalogBundle({ catalogPath, projectionPath, manifestPath, check: true }),
      /CATALOG_MANIFEST_DERIVED_FIELDS_STALE/
    )
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
