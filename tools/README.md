# Outils

Scripts futurs de validation des catalogues, contrôle anti-fuite, packaging reproductible, calcul SHA-256 et vérification de promotion exacte.

## Pipeline catalogue tabulaire générique — ADR-037 / ADR-040

Le chemin nominal des niveaux post-A2 est `tools/tabular-catalog-pipeline.mjs`.

Entrée :
- classeur Excel éditorial approuvé identifié par nom + SHA-256 dans un manifeste source versionné ;
- export CSV canonique UTF-8, déterministe et lossless, lié par SHA-256 ;
- bundle runtime précédent `public/catalogs/runtime/{catalog.json,runtime-projection.json,manifest.json}`.

Le CSV canonique utilise un contrat de colonnes stable et conserve les champs éditoriaux, exemples bilingues, affectations LVA/LVB, décisions de réconciliation, cues explicites et parcours éventuels. La commande `canonicalize` normalise seulement la représentation CSV ; elle ne prend aucune décision lexicale.

Construction :

```sh
node tools/tabular-catalog-pipeline.mjs build \
  --csv <source-canonique.csv> \
  --source-manifest <SOURCE_MANIFEST.json> \
  --baseline-dir public/catalogs/runtime \
  --output-dir <répertoire-sortie> \
  --exceptions <rapport-exceptions.json>
```

Le build est fail-closed. En présence d'une anomalie ou décision humaine manquante, le rapport d'exceptions est écrit mais aucun bundle partiel n'est produit. En cas de succès, seuls les trois artefacts runtime sont produits : `catalog.json`, `runtime-projection.json`, `manifest.json`.

Les UUID sont des UUID v5 déterministes compatibles avec `src/content/lexicalBatch.ts`. Une identité existante est réutilisée automatiquement lorsque la traduction est identique ; une divergence de traduction exige une décision explicite `REUSE`. Une nouvelle collision de prompt exige des cues explicites versionnées pour toutes les réponses concernées.

Aucune classification scolaire n'est inférée : les pistes requises sont déclarées dans le manifeste source et les classes proviennent exclusivement des colonnes éditoriales.

### Alias source — ADR-041

Le CSV canonique peut rattacher une ligne synonyme à une identité existante sans créer un second SRS :
- `alias_of_review_id` cible une ligne primaire du même CSV ;
- `alias_of_entry_id` cible un UUID déjà présent dans la baseline.

La ligne alias reste présente pour la traçabilité éditoriale et scolaire. Le pipeline exige une traduction cible et un type compatibles, puis écrit les variantes dans `runtime-projection.json.source_aliases`. En FR→ES, toutes les formes source sont acceptées ; en ES→FR, seul le lemme primaire sert de recto.
