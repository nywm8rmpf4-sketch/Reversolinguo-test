# ADR-042 — Provenance canonique du manifeste source dans OPT-LEX

Statut : **ACCEPTED — IMPLEMENTATION PENDING QUALIFICATION**  
Date : 19 septembre 2026  
Décideurs : Product Owner Reversolinguo + équipe de réalisation  
Contexte : ADR-037, ADR-040, ADR-041

## Contexte

La rematérialisation B1 du 19 septembre a reproduit byte-à-byte le catalogue lexical mais pas la projection ni le manifeste : projection documentée `64ddc062…`, rematérialisation `8e9cb695…`. Le pipeline qualifié construit `runtime-projection.json.source.artifact` à partir de la chaîne brute passée à `--source-manifest`. Deux invocations lisant le même fichier par un chemin repo-relatif ou absolu produisent donc des octets différents.

Le chemin exact utilisé par le premier PASS n'a pas été journalisé et le fichier de sortie `64ddc062…` n'a pas été conservé comme artefact immuable. La cause racine démontrée est donc une dépendance de sortie au chemin d'invocation ; aucune divergence lexicale, UUID/SRS ou de baseline n'est nécessaire pour l'expliquer.

## Décision

Le pipeline doit canonicaliser la provenance du manifeste avant génération :

1. résoudre le chemin fourni contre la racine du dépôt ;
2. le reconvertir en chemin repo-relatif POSIX ;
3. refuser fail-closed tout chemin qui sort de la racine du dépôt ;
4. stocker uniquement cette forme canonique dans `projection.source.artifact`.

Ainsi, un chemin absolu sous la racine et son équivalent relatif produisent exactement les mêmes octets.

## Impact

- code affecté : `tools/tabular-catalog-pipeline.mjs` uniquement ;
- tests affectés : contrat de déterminisme/provenance du pipeline ;
- données lexicales, UUID, SRS, loader, UI et runtime métier : hors périmètre ;
- selon `QA_IMPACT_POLICY.json`, un changement sous `tools/(?!qa-)` est `RUNTIME_CODE` et doit être qualifié sur `candidate/**` par `runtime_full`.

## Critères d'acceptation

- mêmes sorties byte-identiques pour manifeste relatif et absolu équivalents ;
- provenance écrite sous forme repo-relative stable ;
- chemin hors dépôt rejeté fail-closed ;
- tests existants du pipeline inchangés dans leur oracle métier ;
- campagne publique `runtime_full` PASS avant utilisation pour B1 ;
- après qualification, B1 est rematérialisé deux fois avec le chemin canonique et les trois hashes résultants deviennent la seule preuve applicable.

## Rollback

Revenir au checkpoint `checkpoint/b1-rematerialization-before-determinism-fix-2026-09-19`. Aucun candidat B1 public n'est créé avant qualification.
