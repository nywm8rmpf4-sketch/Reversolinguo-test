# ADR-034 — Intégration de catalogue pilotée par les données

Statut : **ACCEPTED**  
Date : 17 septembre 2026

## Contexte

L'intégration A1 a révélé plusieurs couplages entre contenu et code : listes d'UUID de packs maintenues dans `pack6Runtime.ts`, cardinalités de corpus codées en dur dans le runtime et les tests, champs scolaires présents dans la source éditoriale mais perdus avant la projection runtime, et outil de promotion A1 générant une nouvelle paire de clés à chaque promotion. Ces couplages ont produit à la fois du sur-test, des oracles obsolètes et un défaut produit de projection scolaire.

Le besoin produit est inverse : lorsqu'un catalogue déjà revu change sans modification du chargeur, du schéma, du SRS ni de l'UI, l'opération doit être essentiellement **data-only**, reproductible, fail-closed et vérifiée par les invariants réellement affectés.

ADR-002 reste applicable : JSON canonique versionné côté runtime. ADR-004 reste applicable : manifeste signé, vérification fail-closed. ADR-033 reste applicable : les classifications LVA/LVB sont des données éditoriales immuables ; aucune reclassification automatique n'est autorisée.

## Décision

### 1. Chaîne de données

La source de travail éditoriale reste Excel/CSV. La chaîne cible est :

`Excel/CSV validé → import normalisé → catalogue JSON canonique + projections runtime + manifests/hashes → signature → artefact`

Le runtime ne contient pas de liste manuelle d'UUID propre à une édition du catalogue lorsque cette relation peut être portée par les données.

### 2. Contrat de projections

Les affectations de parcours qui ne font pas partie de la sémantique lexicale d'une entrée sont matérialisées dans un artefact de projection versionné. Il porte au minimum :

- identifiant/version de catalogue ;
- affectations scolaires exactes `track + grade + entry_id` ;
- affectations de parcours thématiques explicites lorsqu'elles ne sont pas dérivables du catalogue ;
- provenance de la source ;
- compteurs déclarés par groupe utiles aux contrôles de complétude.

Les thèmes lexicaux restent lus depuis le catalogue canonique. Une projection peut référencer un thème uniquement s'il appartient à la taxonomie canonique.

Pour LVA/LVB, l'artefact est une **transcription technique** de la classification humaine versionnée. Le compilateur peut normaliser la syntaxe, joindre un `review_id` à un UUID canonique et appliquer l'héritage structurel des packs ; il ne peut jamais choisir, modifier ou déduire la classe.

### 3. Oracles dérivés des données

Les volumes attendus du runtime sont lus depuis les manifests et les artefacts de projection du candidat. Les tests n'embarquent plus de nombres tels que `475`, `415` ou `25` comme oracles de validité du catalogue courant, sauf lorsqu'un nombre représente une invariance historique explicitement versionnée et documentée.

Les contrôles génériques portent notamment sur :

- schéma et version ;
- UUID uniques et références connues ;
- statut/provenance/licence ;
- taxonomie ;
- correspondance `entry_count` ↔ catalogue ;
- absence de doublon de relation ;
- complétude des projections attendues ;
- absence d'identité SRS parallèle ;
- intégrité cryptographique des données runtime.

### 4. Signature et rotation de clé

L'outil de compilation/promotion ne doit plus générer automatiquement une nouvelle paire de clés ni réécrire la clé publique applicative comme effet secondaire d'un changement de contenu.

Le signataire consomme une clé privée fournie **hors dépôt** et vérifie qu'elle correspond à une clé publique déjà approuvée/pinnée. En l'absence de clé privée approuvée, la signature est `NOT_EXECUTED` et la promotion runtime est bloquée ; aucune clé de secours et aucun mode permissif ne sont autorisés.

La mise en place d'une autorité de signature stable constitue une opération de sécurité distincte. Une fixture de clé éphémère est autorisée uniquement dans les tests de l'outil et ne peut jamais signer un candidat produit.

### 5. Profil QA `RUNTIME_DATA_ONLY`

Un profil dédié est introduit pour un diff composé uniquement des artefacts runtime de catalogue/projection/manifests/signatures, **sans changement** de code, de schéma, de loader, de SRS, de stockage, d'UI, de PWA ni d'infrastructure.

Ce profil exige :

- classification d'impact et preuve de sélection ;
- validation lexicale/structurelle ciblée ;
- validation des projections et de leur complétude ;
- validation d'intégrité/signature ;
- test d'intégration de chargement du catalogue/projections ;
- build de l'artefact runtime et hash de l'artefact.

Il n'exige pas par défaut une régression E2E, offline ou accessibilité complète si leur applicabilité antérieure est démontrée et si aucun contrat transversal n'a changé. Toute modification de code/loader/schéma ou chemin inconnu fait escalader vers `RUNTIME_CODE` ou `RUNTIME_CONTENT` selon la politique.

### 6. Transition

Le chantier OPT-CATALOG-DATA-ONLY est exécuté **avant** l'intégration du catalogue A1 mis à jour. Le corpus A1 actuellement présent dans le maître privé sert uniquement à qualifier le mécanisme générique et à prouver la non-régression des relations déjà existantes ; aucune nouvelle classification scolaire n'est inventée.

Le futur A1 ne peut être intégré qu'après disponibilité des classifications LVA/LVB exactes du catalogue éditorial et après qualification de ce pipeline.

## Conséquences

Positives : changement de volume sans retouche de code nominale, réduction des oracles périmés, détection automatique d'une projection oubliée, QA proportionnée au risque, séparation nette entre contenu éditorial et moteur.

Coûts : ajout d'un contrat de projection, adaptation de la gouvernance QA, migration unique des relations historiques vers l'artefact data, formalisation d'une clé de signature stable hors dépôt.

## Critères de validation

L'ADR est considérée implémentée lorsque :

1. un artefact de projection est généré/validé par contrat ;
2. le runtime sait le consommer sans liste UUID éditoriale manuelle ;
3. les tests de volume et de projection lisent les données/manifests ;
4. le profil `RUNTIME_DATA_ONLY` est couvert par des tests de gouvernance fail-closed ;
5. l'outil de signature ne génère plus de clé produit automatiquement ;
6. un rejeu contrôlé prouve qu'un changement de données conforme n'exige pas de modification du code applicatif ;
7. le REX est enregistré avant clôture.

## Rollback

Le checkpoint pré-code `checkpoint/opt-catalog-data-only-precode-2026-09-17` permet de revenir à l'état antérieur. Aucun catalogue A1 mis à jour ne doit être importé pendant le chantier structurel.
