# ADR-037 — Industrialisation du pipeline tabulaire générique avant B1

Statut : **ACCEPTED — PLANNED**  
Date : 2026-09-18  
Décideurs : Product Owner Reversolinguo + équipe de réalisation  
Remplace / remplacé par : complète ADR-024/025/031/033/034/036

## Contexte et forces

A1 puis A2 ont nécessité des travaux de mise au point de structure, projection, intégrité, réconciliation et staging qui ne doivent pas être répétés pour chaque niveau CECRL. La source éditoriale A1→B2 contient déjà les couples lexicaux, traductions, exemples et affectations utiles. B1 (~1189 unités historiques) et B2 (~1076) doivent donc être traités comme des macro-lots de données, pas comme des suites d'opérations manuelles.

Le tooling courant sait préparer et valider un bundle hash-only et classifier un diff strictement data-only, mais il manque encore une chaîne tabulaire générique de bout en bout. Le compilateur de projection courant conserve en outre des hypothèses spécifiques à A1.

A2 est déjà engagé avec son processus de transition. Le réoutiller au milieu créerait un risque de reprise sans bénéfice proportionné. Le chantier est donc placé après clôture A2 et avant B1.

## Options examinées

1. Continuer B1/B2 avec le processus A2 par tranches : rejeté, car répétitif, coûteux et contraire au macro-lot CECRL d'ADR-031.
2. Écrire un importeur spécifique B1 puis B2 : rejeté, car duplication et dette immédiate.
3. Industrialiser une chaîne tabulaire générique avant B1 : retenu.

## Décision

Après A2 et avant toute matérialisation B1, mettre en place **OPT-LEX-PIPELINE** avec les invariants suivants :

1. le fichier Excel approuvé et hashé reste la source éditoriale de référence ;
2. un CSV canonique déterministe et lossless sert d'interchange automatisable ;
3. un convertisseur générique produit `lexical-entry-v2` sans logique codée pour un niveau particulier ;
4. les UUID sont stables/déterministes et les collisions/doublons avec les niveaux antérieurs sont détectés automatiquement ;
5. la projection scolaire est pilotée par les données validées ; niveaux, classes et pistes ne sont pas codés en dur pour A1/A2/B1/B2 ;
6. les validations sont fail-closed sur schéma, champs requis, traduction, exemple, taxonomie, provenance, licence, volumes, doublons et relations ;
7. le chemin nominal ne requiert aucune revue humaine ligne par ligne ; seules les exceptions non résolubles automatiquement sont soumises à arbitrage ;
8. `catalog.json`, `runtime-projection.json` et `manifest.json` sont générés avec leurs hashes exacts ;
8a. avant B1, les données catalogue doivent être découplées du chunk JavaScript applicatif (ou mécanisme équivalent démontré) afin de rester précachables/offline sans relever le plafond PWA transitoire A2 de 3 MiB ; l'intégrité hash-only doit rester vérifiée ;
9. les modifications de tooling/code sont qualifiées une fois dans `Reversolinguo-test` uniquement ;
10. une fois le mécanisme qualifié, un futur niveau dont le diff réel est strictement données/manifeste suit `RUNTIME_DATA_ONLY` conformément à ADR-034/036 et à la gouvernance d'impact ;
11. chaque niveau reste un macro-lot unique pour sa qualification publique ; les micro-tranches sont réservées au diagnostic local ;
12. l'optimisation n'est close qu'après mise à jour du registre REX imposé par ADR-012.

**B1_IMPORT_ALLOWED = NO** tant que les critères de preuve du pipeline ne sont pas satisfaits.

## Conséquences

Positives : suppression du traitement manuel nominal par ligne, réduction des reprises, même chemin pour B1/B2 et futurs niveaux, validation plus reproductible, rayon d'impact mieux borné et QA proportionnée au diff réel.

Coût : une modification unique du tooling et des contrats de projection doit être implémentée et qualifiée avant B1.

Dette acceptée : A2 reste le dernier lot utilisant le processus de transition déjà engagé.

Réversibilité : si le pipeline générique ne peut pas être qualifié, B1 reste bloqué jusqu'à une décision de remplacement explicite ; aucun retour silencieux à un import manuel spécifique n'est autorisé.

Critère de réexamen : évolution du schéma lexical, catalogue distribué indépendamment de l'application, nouvelle paire de langues nécessitant des champs non couverts, ou preuve que le CSV canonique perd une information de la source éditoriale.

## Preuves et validation

Avant ouverture B1 :

- test de déterminisme byte-identique sur replay ;
- tests de schéma et de fail-closed ;
- tests de déduplication/collision avec niveaux précédents ;
- tests de projection multi-niveaux/classes sans constantes A1 ;
- test freshness et analyse d'impact ;
- qualification des changements de tooling/code dans `Reversolinguo-test` seulement ;
- replay démontrant l'éligibilité `RUNTIME_DATA_ONLY` d'un changement ultérieur strictement data-only ;
- REX de l'optimisation.

Résultats autorisés : `PASS`, `FAIL`, `TIMEOUT`, `NOT_EXECUTED`.

## Impacts documentaires

- `ROADMAP.md` : ajout du workstream OPT-LEX-PIPELINE entre A2 et B1 ;
- `REPRISE.md`, `documentation/PROJECT_STATE.md`, `CHECKPOINT_STATE.json` : traçabilité du gate futur ;
- registre ADR : présente décision ;
- `pack_initialisation_retour_experience.md` : à mettre à jour après implémentation effective et avant clôture de l'optimisation.
