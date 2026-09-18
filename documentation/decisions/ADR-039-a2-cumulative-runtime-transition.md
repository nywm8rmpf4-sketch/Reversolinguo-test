# ADR-039 — Bundle runtime cumulatif A2 de transition

Statut : **ACCEPTED**  
Date : 18 septembre 2026  
Contexte : ADR-033, ADR-034, ADR-037, ADR-038

## Contexte

Le runtime A1 humainement validé charge actuellement un bundle depuis `catalogs/fr-es/a1/`. A2 ajoute 592 nouvelles identités lexicales, tout en réutilisant 8 identités A1 réconciliées pour la projection scolaire. Le plan projet précise qu'A2 est le dernier niveau traité avec la chaîne de transition actuelle et qu'ADR-037 industrialisera ensuite un pipeline/chargeur générique avant B1.

Réutiliser le chemin `a1/` pour un catalogue cumulatif A1+A2 rendrait le nom et le `catalog_id` trompeurs. Introduire dès maintenant le chargeur générique final empiéterait sur le chantier ADR-037 explicitement planifié après la clôture A2.

## Décision

### 1. Bundle cumulatif A2

Le candidat runtime A2 est matérialisé sous :

- `catalogs/fr-es/a2/catalog.json`
- `catalogs/fr-es/a2/runtime-projection.json`
- `catalogs/fr-es/a2/manifest.json`

Le catalogue A2 runtime est **cumulatif** : il contient byte-for-byte les 475 identités A1 du candidat humainement validé `Reversolinguo-test/main@01318dfb939c77f7ee4a79407a9c51aceb65357e`, puis les 592 nouvelles identités A2 issues du staging qualifié. Total attendu : **1067 identités canoniques uniques**.

Le manifeste porte `catalog_id = fr-es-a2`, `cefr_level = A2`, le volume et les hashes exacts du catalogue et de la projection.

### 2. Statut avant revue humaine

Les 475 entrées A1 conservent exactement leur statut/provenance validés. Les 592 entrées A2 conservent leur statut éditorial `draft` tant que la revue sémantique/humaine applicable n'a pas produit de verdict permettant une promotion de statut. Le runtime candidat peut charger ces drafts ; leur statut n'est pas exposé à l'utilisateur.

Le manifeste candidat reste `status = draft-human-review` et `human_review = NOT_EXECUTED` avant le gate humain.

### 3. Packs adultes

Le pack adulte A1 contient directement les identités A1. Le pack adulte A2 contient directement les identités A2 et hérite du pack A1. Ainsi :

- vue A1 = 475 identités ;
- vue A2 `new-only` = 592 identités ;
- vue A2 cumulative = 1067 identités.

Une identité A1 réconciliée depuis une ligne source A2 n'est pas recréée dans le pack adulte A2.

### 4. Projection scolaire

La projection runtime A2 est cumulative.

Elle conserve les affectations A1 exactes du candidat humainement validé et ajoute les affectations A2 provenant des 603 unités source, avec la règle suivante :

- 592 nouvelles unités actives → leur UUID A2 ;
- 8 collisions A1 réconciliées → l'UUID A1 accepté ;
- 3 exclusions éditoriales → aucune relation runtime.

Les classifications LVA/LVB restent celles de la source humaine ; aucun recalcul n'est autorisé. Les relations réconciliées peuvent pointer vers une identité déjà héritée par un pack antérieur ; le moteur de packs déduplique alors l'identité canonique sans créer de second SRS.

### 5. Parcours thématique

Pour le parcours `voyage`, les identités A2 dont le thème canonique contient explicitement `voyage` sont ajoutées au niveau thématique A2. Cette opération est une projection technique du thème déjà validé, pas une reclassification sémantique.

### 6. Transition de chargeur

Pour ce candidat A2 uniquement, les imports runtime passent explicitement de `catalogs/fr-es/a1/` à `catalogs/fr-es/a2/`.

Cette dépendance au niveau est **temporaire et documentée**. Avant B1, ADR-037 doit supprimer cette nécessité en fournissant un pipeline/point de chargement générique afin que B1/B2 puissent redevenir strictement data-only lorsque le schéma et le runtime restent inchangés.

### 7. Budget de précache PWA de transition

Le bundle cumulatif A1+A2 porte temporairement les données lexicales dans le chunk applicatif. La première construction réelle A2 produit un chunk principal d'environ **2,50 MB non compressé / 356,5 kB gzip**, supérieur au plafond Workbox par défaut de 2 MiB.

Pour préserver le fonctionnement **offline** d'A2 sans introduire au milieu du macro-lot une refonte de chargement, le plafond `injectManifest.maximumFileSizeToCacheInBytes` est fixé explicitement à **3 MiB** pour la transition A2. Le build reste fail-closed au-dessus de ce seuil.

Cette hausse est une dette de transition bornée, pas une stratégie B1/B2. Avant B1, ADR-037 doit empêcher la croissance continue du chunk applicatif en séparant les données catalogue du code (ou mécanisme équivalent démontré), tout en garantissant leur précache/offline et leur intégrité hash-only. **Le plafond 3 MiB ne doit pas être relevé pour faire entrer B1/B2 sans nouvelle décision structurante.**

### 8. Génération déterministe

Un outil de génération fail-closed construit le bundle cumulatif à partir :

1. du A1 public accepté exact ;
2. du manifeste de staging A2 ;
3. des source-maps et drafts A2.

Il vérifie au minimum : baseline A1, couverture 603, 592 drafts, 11 exclusions, 8 réconciliations, 3 exclusions éditoriales, UUID/identités uniques, classifications scolaires complètes, hashes et reproductibilité.

Aucune Action n'est exécutée sur le dépôt privé. La génération exécutable et la QA ont lieu uniquement dans `Reversolinguo-test`.

## Conséquences

- A2 constitue volontairement un changement `RUNTIME_CODE` : ADR-038 + bascule du bundle + adaptation des packs.
- La campagne publique requise est donc `runtime_full`, pas `EDITORIAL_STAGING` ni `RUNTIME_DATA_ONLY`.
- A1 reste une baseline identifiable et inchangée dans le bundle cumulatif.
- B1 reste interdit tant qu'ADR-037 n'est pas qualifiée.

## Critères d'acceptation

- catalogue cumulatif = 1067 UUID uniques ;
- A1 exact = 475 identités inchangées ;
- A2 new-only = 592 identités ;
- source A2 = 603 lignes, dont 8 réconciliations A1 et 3 exclusions éditoriales ;
- projection scolaire sans UUID inconnu et avec comptabilité source exacte ;
- pack adulte A1=475 direct, A2=592 direct, A2 cumulatif=1067 ;
- contexte ADR-038 actif uniquement sur cues ambiguës ;
- intégrité SHA-256 du bundle ;
- QA publique `runtime_full` PASS avant revue sémantique/HUMAN_TEST_READY.
