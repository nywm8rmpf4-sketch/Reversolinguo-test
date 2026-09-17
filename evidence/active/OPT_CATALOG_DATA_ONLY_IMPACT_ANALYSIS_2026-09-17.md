# OPT-CATALOG-DATA-ONLY — analyse d'impact et fraîcheur

Date : 17 septembre 2026  
Baseline privée : `3189c9c78da091936507883a266116943c1d2b7a`  
Checkpoint : `checkpoint/opt-catalog-data-only-precode-2026-09-17`

## Objectif

Découpler l'intégration d'un catalogue lexical déjà revu du code applicatif : projections pilotées par données, volumes dérivés des manifests, signature sans rotation automatique de code, et profil QA data-only ciblé.

## Hors périmètre

- import du catalogue A1 mis à jour ;
- création ou reclassification LVA/LVB ;
- modification du SRS, IndexedDB, UI ou comportement pédagogique ;
- certification/publication `Reversolinguo` ;
- modification du contenu lexical humainement validé.

## État réel observé au HEAD

- le maître privé contient encore le catalogue A1 de 60 entrées et son manifeste `entry_count=60` ;
- `pack6Runtime.ts` contient cependant des oracles 475/415/25 hérités d'un candidat public ultérieur ;
- les 25 affectations scolaires 6e et les 4 affectations Voyage sont des listes UUID TypeScript ;
- `EditorialLexicalRow` porte `school_lva`/`school_lvb`, mais `lexicalInputFor()` ne transfère pas ces données vers un artefact de projection ;
- `promote-a1-macro.mjs` génère une nouvelle paire ECDSA et réécrit `catalogSigningKey.ts` à chaque promotion ;
- `QA_IMPACT_POLICY.json` classe tout catalogue canonique runtime comme `RUNTIME_CONTENT`, avec régression complète obligatoire.

## Risques

1. affaiblissement de SEC-002 si une nouvelle donnée runtime n'est pas couverte par une intégrité authentifiée ;
2. modification accidentelle des relations scolaires historiques ;
3. création de doublons ou d'UUID inconnus dans les packs ;
4. sous-test du futur profil data-only ;
5. sur-test conservé si la gouvernance ne distingue pas données et code ;
6. outil de signature inutilisable tant qu'une clé stable approuvée n'est pas provisionnée hors dépôt.

## Critères d'acceptation

- ADR-034 acceptée avant refonte ;
- contrat de projection explicite, versionné et fail-closed ;
- migration des relations historiques sans changement sémantique ;
- aucune liste UUID de catalogue nominale dans le runtime ;
- volumes du catalogue/projections dérivés des données ;
- tests génériques sur références, doublons, taxonomie et continuité d'identité ;
- signer produit sans génération automatique de clé ;
- profil `RUNTIME_DATA_ONLY` fail-closed et testé ;
- code/loader/schema modifiés pendant ce chantier qualifiés avec le profil fort approprié ; le nouveau profil ne s'applique qu'aux futurs diffs data-only ;
- REX complété avant clôture.

## Fraîcheur des tests avant modification

### Démontrés obsolètes

- `tests/unit/pack6-canonical-promotion.test.ts` : assertions exactes `475`, `415`, `25` liées à un état de corpus et non à un invariant générique ; elles doivent être remplacées par des attentes dérivées du candidat.
- `validatePack6BRuntime()` : mêmes oracles codés en dur ; ce n'est pas un test externe mais un validateur runtime périmé vis-à-vis du maître privé actuel.

### À préserver

- validation de schéma des packs ;
- validation du graphe de packs ;
- unicité/références UUID ;
- taxonomie ;
- tests positifs/négatifs de signature ADR-004 ;
- tests de gouvernance QA ADR-027 ;
- continuité SRS par UUID canonique.

### Nouvelles preuves nécessaires

- tests unitaires du contrat de projection : nominal + UUID inconnu + doublon + track/grade invalide + thème invalide ;
- test de migration/parité des 25 relations scolaires et 4 relations Voyage historiques ;
- test de génération déterministe d'une projection depuis une fixture éditoriale exacte ;
- tests de gouvernance du profil `RUNTIME_DATA_ONLY` : sélection nominale, escalade code/schéma, rejet de sous-test et rejet de sur-test ;
- test du signataire : clé absente => `NOT_EXECUTED`/échec fermé ; clé de test explicite => signature vérifiable ; aucune génération de clé implicite.

## Sélection QA du chantier structurel

Le chantier lui-même modifie code, outils et gouvernance : il **ne peut pas** être qualifié avec `RUNTIME_DATA_ONLY`. Sa qualification doit utiliser un profil fort couvrant les fichiers réellement modifiés, avec tests unitaires/intégration/build et campagne publique dans `Reversolinguo-test` uniquement.

Une fois qualifié, un futur diff limité à `catalog.json`, projection data, manifests/signatures et preuves neutres pourra relever de `RUNTIME_DATA_ONLY`, sous réserve que le classifieur confirme qu'aucun code/schéma/loader/transversal n'a changé.

## Rollback

Retour au checkpoint `3189c9c78da091936507883a266116943c1d2b7a` ou à la branche `checkpoint/opt-catalog-data-only-precode-2026-09-17`. Aucun import A1 nouveau n'est effectué dans ce lot.
