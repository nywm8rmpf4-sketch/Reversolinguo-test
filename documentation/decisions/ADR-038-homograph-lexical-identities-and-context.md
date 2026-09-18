# ADR-038 — Identités lexicales homographes et contexte de désambiguïsation

Statut : **ACCEPTED**  
Date : 18 septembre 2026  
Décideurs : Product Owner Reversolinguo + équipe de réalisation  
Remplace / remplacé par : amende ADR-025 ; complète ADR-031, ADR-033 et ADR-037

## Contexte et forces

Le macro-lot A2 a révélé un cas réel que l'ADR-025 avait explicitement identifié comme critère de réexamen : deux unités pédagogiques actives portent exactement le même lemme source `la salsa`, mais des sens indépendants :

- `REV-A2-0152` : `la salsa` = la sauce ;
- `REV-A2-0603` : `la salsa` = la salsa, danse / musique.

Les deux unités ont des affectations scolaires différentes et doivent conserver des historiques SRS indépendants. Les fusionner ferait perdre cette indépendance ; modifier artificiellement le lemme exposé à l'utilisateur altérerait la source linguistique ; conserver deux UUID calculés uniquement depuis le lemme produit une collision.

En sens espagnol → français, afficher seulement `la salsa` rend en outre la question ambiguë : deux réponses différentes sont légitimes sans contexte.

Le Product Owner a validé la règle générale suivante : **lorsqu'un même mot peut désigner plusieurs unités sémantiques actives distinctes, chaque unité reste une carte pédagogique indépendante et, dans tout sens de traduction où le recto serait ambigu, l'application fournit suffisamment de contexte pour qu'une seule réponse soit attendue.**

## Options examinées

### A — Fusionner les sens dans une seule entrée

Une entrée `la salsa` porterait plusieurs `senses[]`. Rejeté pour ce cas : une seule identité SRS ne permettrait plus d'apprendre indépendamment les deux sens et ne préserverait pas naturellement leurs affectations scolaires distinctes.

### B — Modifier le lemme affiché

Exemples : `la salsa (sauce)`, `la salsa (danse)`. Rejeté : le texte lexical source serait artificiellement modifié pour résoudre un problème d'identité technique.

### C — Identités pédagogiques distinctes avec discriminateur technique stable et contexte de recto

Retenu. Le lemme reste exact ; les unités ont des UUID distincts et un SRS distinct ; le runtime ajoute du contexte uniquement lorsque le recto, pris isolément, ne permet pas de déterminer une réponse unique.

## Décision

### 1. Discriminateur d'identité optionnel

Le schéma `lexical-entry-v2` accepte un champ optionnel top-level `sense_key`.

- `sense_key` est un identifiant technique éditorial stable, non affiché comme partie du lemme ;
- il est utilisé uniquement lorsqu'une unité pédagogique supplémentaire doit partager le même lemme normalisé qu'une autre unité active ;
- il est normalisé en NFC, trim et minuscules pour l'identité ;
- sa valeur doit être stable et sémantiquement explicite, par exemple `dance-music` ;
- le pipeline ne doit jamais inventer automatiquement un `sense_key` à partir d'un thème, d'une classe scolaire ou d'une heuristique.

### 2. Compatibilité des UUID

Pour une entrée sans `sense_key`, l'identité UUID reste **strictement inchangée** :

`reversolinguo-lexical-v1|<source>|<target>|<lemma>`

Pour une entrée avec `sense_key`, l'identité devient :

`reversolinguo-lexical-v1|<source>|<target>|<lemma>|sense:<sense_key>`

Ainsi, tous les UUID historiques sans discriminateur restent stables. Une unité homographe supplémentaire reçoit un UUID v5 déterministe distinct.

Pour A2, `REV-A2-0152` conserve l'identité historique de base `la salsa`; `REV-A2-0603` reçoit `sense_key = dance-music`.

### 3. Unicité sémantique

L'unicité qualifiable devient :

`language_tag + lemma normalisé + sense_key normalisé éventuel`.

Deux unités de même lemme sont autorisées uniquement si leurs identités discriminées sont distinctes. Deux entrées partageant le même lemme **et** le même `sense_key` restent une collision fail-closed.

Une collision de lemme sans discriminateur supplémentaire reste fail-closed.

### 4. SRS et projections

Chaque entrée discriminée possède son propre `entry_id` canonique et donc son propre schedule SRS. Les projections scolaires continuent de mapper chaque `review_id` vers son UUID canonique exact ; aucune fusion ou reclassification automatique n'est autorisée.

### 5. Désambiguïsation du recto

Le runtime détecte les collisions de **cue affichée** dans chaque direction de traduction.

Si plusieurs entrées actives présentent le même texte de recto normalisé mais attendent des réponses différentes :

- le mot/lemme reste affiché tel quel ;
- avant la réponse, l'application affiche un contexte dans la langue du recto ;
- par défaut, ce contexte provient de l'exemple correspondant (`example_source` pour source → cible, `example_target` pour cible → source) ;
- si l'exemple ne suffit pas à rendre le choix unique, ou s'il révèle accidentellement la réponse attendue, une **cue éditoriale explicite** peut surcharger ce contexte sans modifier l'entrée lexicale canonique ;
- ces overrides sont versionnés dans le bundle du niveau, liés par `entry_id + direction`, et ne sont appliqués qu'aux rectos réellement ambigus ;
- aucune cue ne doit contenir textuellement la réponse attendue ;
- le contexte n'est pas ajouté aux rectos non ambigus.

Les collisions de recto sont de deux natures et doivent être traitées différemment :

1. **polysémie / sens distincts** : le contexte doit sélectionner le sens attendu ;
2. **synonymie ou variante lexicale** : la cue doit expliciter la nuance utile au choix (registre, aire d'usage, construction grammaticale ou usage lexical) sans donner le mot lui-même.

Si aucune distinction linguistique honnête ne permet de choisir une forme unique, le cas doit être renvoyé en arbitrage éditorial plutôt que de fabriquer un faux contraste.

La revue sémantique vérifie exhaustivement que chaque collision de recto actif dispose d'un contexte distinctif, compréhensible et non révélateur.

### 6. Vocabulaire et affichages non interrogatifs

Dans un écran où les deux langues sont déjà visibles simultanément, comme le navigateur de vocabulaire, aucune désambiguïsation supplémentaire n'est obligatoire : la traduction visible fournit déjà le contexte sémantique nécessaire.

### 7. Pipeline générique

ADR-037 devra traiter les homographes comme exceptions structurées :

- détection automatique du groupe de lemmes homographes ;
- fail-closed si plusieurs unités indépendantes n'ont pas d'identité discriminée suffisante ;
- `sense_key` fourni par la donnée/arbitrage éditorial, jamais inventé par heuristique ;
- rapport d'exception uniquement lorsque la source ne permet pas de résoudre déterministiquement le cas ;
- détection des collisions de recto dans les deux directions et génération/validation d'overrides éditoriaux lorsque l'exemple canonique ne suffit pas.

## Conséquences

### Positives

- maintien de cartes et SRS indépendants par sens ;
- conservation exacte du lemme utilisateur ;
- aucune migration des UUID historiques sans `sense_key` ;
- progression scolaire distincte préservée ;
- règle générique réutilisable dans les deux directions et pour d'autres langues ;
- questions de flashcard non ambiguës.

### Coûts et risques

- évolution du schéma lexical, du pipeline d'identité et du contrat d'unicité ;
- le candidat A2 ne sera plus strictement data-only puisque le runtime doit apprendre à afficher un contexte conditionnel ;
- la détection des cues ambiguës doit être testée dans les deux directions ;
- un mauvais exemple contextuel peut rester insuffisant : la revue sémantique doit le détecter ;
- les overrides de contexte deviennent une donnée éditoriale versionnée supplémentaire et doivent rester synchronisés avec les collisions réellement actives.

## Rollback

Avant promotion A2, rollback = revenir aux fichiers/code précédents et bloquer A2 sur la collision. Après promotion, supprimer le mécanisme exigerait une migration explicite des identités discriminées et n'est donc pas un rollback silencieux.

## Preuves et validation attendues

- test prouvant qu'un UUID sans `sense_key` reste byte-identique à la baseline ADR-025 ;
- test prouvant qu'un `sense_key` crée un UUID v5 stable et distinct ;
- test de collision fail-closed pour même lemme + même discriminateur ;
- test autorisant deux unités homographes correctement discriminées ;
- test de schéma `sense_key` ;
- test runtime : même cue + réponses différentes → contexte visible avant révélation ;
- test runtime : cue unique → aucun contexte supplémentaire ;
- test dans les deux directions de traduction ;
- test exhaustif : chaque cue ambiguë active possède un contexte, chaque override correspond à une cue réellement ambiguë, aucun contexte ne révèle textuellement la réponse attendue ;
- contrôle A2 macro : 603 unités source, 592 inclusions, 11 exclusions, 592 UUID uniques ;
- conservation des affectations scolaires humaines ;
- QA publique sur `Reversolinguo-test` uniquement ;
- revue sémantique exhaustive A2 avant `HUMAN_TEST_READY`.

## Impacts documentaires

- ADR-025 est amendée par la présente décision ;
- ADR-037 doit incorporer `sense_key` dans le pipeline tabulaire générique ;
- ROADMAP, CHECKPOINT_STATE, PROJECT_STATE et REPRISE sont synchronisés au prochain checkpoint A2 ;
- la preuve du défaut initial reste `evidence/active/A2_MACRO_COLLISION_DIAGNOSTIC_2026-09-18.md`.
