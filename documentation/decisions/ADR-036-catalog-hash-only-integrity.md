# ADR-036 — Intégrité catalogue simple par manifeste SHA-256

Statut : **ACCEPTED**  
Date : 2026-09-17  
Décideurs : Product Owner Reversolinguo + équipe de réalisation  
Remplace : les exigences de signature produit d’ADR-004/ADR-034 et ADR-035 pour l’architecture actuelle

## Contexte

Le catalogue Reversolinguo est aujourd’hui livré comme partie intégrante d’une PWA statique/offline. Le cycle de confiance est déjà borné : source maîtresse privée, QA uniquement dans `Reversolinguo-test`, artefact exact qualifié, puis publication sans reconstruction.

La signature ECDSA du manifeste ajoutait une autorité de clé, un secret CI, des rotations et une QA runtime complète lors des changements d’ancre publique, pour un gain limité tant que catalogue et application sont distribués ensemble et qu’aucun catalogue externe n’est accepté.

## Décision

Le contrat nominal devient :

`source éditoriale validée → catalogue JSON + projection runtime → manifeste avec SHA-256 → QA → artefact exact`

Aucune clé privée, secret GitHub, clé publique épinglée ni signature détachée n’est requise pour un catalogue produit.

Le runtime vérifie fail-closed le manifeste, le SHA-256 de `catalog.json` et, lorsqu’une projection est liée, le SHA-256 de `runtime-projection.json`.

Le profil `RUNTIME_DATA_ONLY` autorise uniquement `catalog.json`, `runtime-projection.json` et `manifest.json` lorsque code, loader, schéma, SRS, stockage, UI, PWA et infrastructure restent inchangés. `manifest.sig.json` ne fait plus partie du contrat actif.

## Limites / réexamen

Le SHA-256 garantit la cohérence interne du bundle mais n’authentifie pas un signataire. Une signature devra être réévaluée avant tout catalogue téléchargé indépendamment, importé par l’utilisateur, fourni par un tiers ou mis à jour séparément de l’application.

## Transition

La transition supprime l’exigence de signature du runtime et de la QA data-only. Comme elle modifie le contrat d’intégrité applicatif, elle doit passer une campagne runtime complète dans `Reversolinguo-test`.

Après ce PASS, les futurs catalogues compatibles peuvent suivre le chemin data-only hash-bound. ADR-035 est superseded avant activation produit : son mécanisme CI a été qualifié, mais aucun secret produit n’a été provisionné et aucune rotation k5→k6 n’a été exécutée.
