# ADR-051 — Fonds thématiques spécifiques à la paire de langues

Statut : **ACCEPTED**  
Date : 21 septembre 2026

## Contexte

Le moteur v2.0 sait changer de paire, mais les fonds thématiques v1.2 sont encore une table globale FR–ES. Le test humain FR–EN R6 a révélé que les cartes anglaises héritent donc visuellement de l'Espagne. Le Product Owner demande explicitement : FR–ES = fonds espagnols ; FR–EN = fonds UK.

Après difficulté de transfert des binaires du paquet initial, le Product Owner a demandé de recréer des fonds UK du même genre puis a explicitement validé leur intégration. Le lot R7 embarque donc 20 fonds vectoriels UK dédiés, un par thème, dans la source maîtresse.

## Décision

- La résolution d'un fond devient `theme + pairId`, jamais le thème seul.
- `fr-es` conserve exactement les 20 WebP espagnols certifiés existants.
- `fr-en` utilise les 20 fonds SVG UK recréés pour R7 et intégrés dans `documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/`.
- Aucune substitution silencieuse entre paires. Paire ou thème non enregistré => fond neutre.
- La variante USA reste hors périmètre et non intégrée.
- Le choix dépend de `activePairId`, pas du sens de révision.

## Validation requise

Tests unitaires : couverture 20/20 et unicité par paire, absence de fallback inter-paire. Test navigateur : après bascule FR–EN, une carte utilise un asset UK ; retour FR–ES, asset espagnol. Puis campagne `runtime_full`, promotion exacte, revue sémantique et nouveau gate humain.
