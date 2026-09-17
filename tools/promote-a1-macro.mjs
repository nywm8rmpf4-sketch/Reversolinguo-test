#!/usr/bin/env node

/**
 * Historical A1 promoter retired by ADR-034.
 *
 * It intentionally does not retain its former key-generation or hard-coded
 * corpus-count behaviour. Build the data-only bundle with
 * `tools/prepare-catalog-bundle.mjs`, then sign its exact manifest with
 * `tools/sign-catalog-bundle.mjs` using an approved private key outside the
 * repository.
 */

process.stderr.write('A1_PROMOTER_RETIRED_ADR_034: use prepare-catalog-bundle.mjs then sign-catalog-bundle.mjs\n')
process.exitCode = 2
