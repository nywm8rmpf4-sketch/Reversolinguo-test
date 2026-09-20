# ADR-044 — Projection canonique des alias et sérialisation runtime bornée B2

Statut : **ACCEPTED**  
Date : 20 septembre 2026  
Contexte : ADR-037, ADR-039, ADR-040, ADR-041, ADR-043

## Contexte

L'intégration B2 porte le catalogue cumulatif de 2246 à 3307 identités. Deux défauts fail-closed ont été observés pendant la qualification réelle :

1. deux lignes source alias d'une même identité peuvent avoir des thèmes source différents, ce qui produisait deux relations scolaires contradictoires pour le même triplet parcours/classe/identité ;
2. la sérialisation JSON indentée du catalogue atteignait 3 239 754 octets et dépassait le plafond de précache PWA de 3 MiB fixé par ADR-039.

Relever ce plafond est interdit par ADR-039. Perdre une ligne source ou créer une seconde identité pour contourner une différence de thème serait contraire aux ADR-037 et ADR-041.

## Décision

### 1. Thème de projection d'une identité réconciliée

Les affectations scolaires et thématiques utilisent le thème canonique primaire de l'identité cible. La ligne source et son `review_id` restent présentes dans la projection, mais une variante alias ne peut pas réécrire le thème de l'identité canonique.

Le pipeline détecte et rejette toute relation restante qui associerait plusieurs thèmes au même triplet parcours/classe/identité.

### 2. Sérialisation runtime compacte

Les trois sorties runtime du pipeline générique sont sérialisées en JSON compact déterministe, terminé par un unique saut de ligne. L'ordre déterministe des objets et tableaux reste celui du pipeline ; les SHA-256 sont calculés sur ces octets exacts.

Le CSV canonique, les sources durables et les preuves éditoriales ne changent pas de format. Cette décision ne compresse pas sémantiquement les données et ne change aucune identité.

### 3. Plafond PWA inchangé

Le plafond `maximumFileSizeToCacheInBytes` reste exactement à 3 MiB. La gouvernance vérifie désormais que chacun des trois artefacts runtime respecte réellement ce plafond avant le build.

## Conséquences

- les 1076 lignes B2 restent traçables, y compris les 15 alias ;
- la projection est valide pour les consommateurs runtime ;
- le catalogue cumulatif B2 reste précachable hors ligne sans hausse du plafond ;
- tout changement de sérialisation modifie volontairement les SHA-256 et exige un replay byte-identique ;
- cette décision ne constitue ni une validation humaine ni un `SEMANTIC_REVIEW_PASS`.
