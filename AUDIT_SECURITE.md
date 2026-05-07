# Audit de sécurité QuickNotes

Ce rapport documente les problèmes détectables par la pipeline CI/CD. Le code applicatif n'a pas été corrigé, conformément à la consigne : le rôle de la mission est de détecter, documenter et auditer.

## Synthèse

| # | Type | Localisation | Outil | Criticité |
|---|---|---|---|---|
| 1 | Dépendance vulnérable `lodash` | `package.json:18`, `package-lock.json` | `npm audit` | Critique |
| 2 | XSS reflétée | `src/routes.js:43-57` | Semgrep `quicknotes.reflected-xss-search` | Haute |
| 3 | Path traversal / lecture arbitraire de fichier | `src/routes.js:62-68` | Semgrep `quicknotes.path-traversal-export` | Haute |
| 4 | Route destructive sans authentification | `src/routes.js:35-38` | Semgrep `quicknotes.unauthenticated-delete-note` | Haute |
| 5 | Secret administrateur codé en dur | `src/config.js:8` | Gitleaks `quicknotes-admin-token` + Semgrep | Critique |
| 6 | Authentification admin par token statique partagé | `src/routes.js:76-82`, `src/config.js:8` | Semgrep `quicknotes.static-header-token-auth` | Moyenne |

## 1. Dépendance vulnérable : lodash 4.17.4

## Faille 1 — Dépendance vulnérable lodash

| Champ | Détail |
|---|---|
| Type | Dépendance npm vulnérable / SCA |
| Localisation | `package-lock.json`, `node_modules/lodash` |
| Outil détecteur | `npm audit --omit=dev --audit-level=moderate` |
| Extrait du log | `lodash <=4.17.23`, `1 critical severity vulnerability`, `Prototype Pollution`, `Command Injection`, `Regular Expression Denial of Service` |
| Criticité | Critique |
| Justification | La dépendance `lodash` installée contient plusieurs vulnérabilités connues. Selon les fonctions utilisées, elles peuvent mener à de la pollution de prototype, de l’injection de commande ou du déni de service. |
| Remédiation recommandée | Mettre à jour `lodash` vers une version corrigée, puis relancer `npm audit` et les tests de non-régression. |
| Capture | `screenshots/02-sca-lodash.png` |

## 2. XSS reflétée dans la recherche HTML

| Champ | Détail |
|---|---|
| Type | XSS reflétée |
| Localisation | `src/routes.js:43-57`, surtout `src/routes.js:50` et `src/routes.js:57` |
| Outil détecteur | Semgrep, règle `quicknotes.reflected-xss-search` |
| Extrait du log | `quicknotes.reflected-xss-search: Entrée utilisateur rendue dans du HTML sans échappement: risque de XSS reflétée.` |
| Criticité | Haute |
| Justification | La variable `q` provient de `req.query.q` puis est injectée dans une chaîne HTML retournée avec `res.send(html)`. Un attaquant peut envoyer un lien contenant du JavaScript dans le paramètre `q`. Si une victime ouvre ce lien, le script peut s'exécuter dans son navigateur. |
| Remédiation recommandée | Échapper systématiquement les sorties HTML avec une librairie comme `escape-html`, utiliser un moteur de templates avec auto-escape, ou renvoyer du JSON au lieu d'un rendu HTML manuel. |
| Capture | `screenshots/03-sast-xss.png` |

Exemple d'attaque à tester localement pour comprendre l'impact :

```text
/api/search?q=<script>alert('xss')</script>
```

## 3. Path traversal sur l'export legacy

| Champ | Détail |
|---|---|
| Type | Path traversal / lecture arbitraire de fichier |
| Localisation | `src/routes.js:62-68` |
| Outil détecteur | Semgrep, règle `quicknotes.path-traversal-export` |
| Extrait du log | `quicknotes.path-traversal-export: Lecture de fichier construite depuis une query string: risque de path traversal.` |
| Criticité | Haute |
| Justification | Le paramètre `file` vient de `req.query.file`, puis sert à construire `fullPath` avec `path.join(config.exportDir, file)`. Sans validation ni normalisation stricte, un attaquant peut tenter des chemins comme `../src/config.js` pour lire un fichier hors du dossier `exports`. |
| Remédiation recommandée | Refuser les chemins contenant `..`, `/` ou `\`, utiliser une allowlist de noms de fichiers, résoudre le chemin avec `path.resolve`, puis vérifier qu'il reste strictement sous le dossier `exports`. |
| Capture | `screenshots/04-sast-path-traversal.png` |

Exemple d'attaque à tester localement si un fichier existe :

```text
/api/export?file=../src/config.js
```

## 4. Route DELETE sans authentification visible

| Champ | Détail |
|---|---|
| Type | Broken Access Control |
| Localisation | `src/routes.js:35-38` |
| Outil détecteur | Semgrep, règle `quicknotes.unauthenticated-delete-note` |
| Extrait du log | `quicknotes.unauthenticated-delete-note: Route DELETE destructive sans contrôle d'authentification visible.` |
| Criticité | Haute |
| Justification | `DELETE /api/notes/:id` supprime une note sans vérifier d'utilisateur connecté, de rôle, de token ou de propriété de la note. Tout client capable d'appeler l'API peut supprimer des données. |
| Remédiation recommandée | Ajouter une authentification, vérifier les permissions, limiter la suppression au propriétaire ou à un rôle autorisé, journaliser l'action et ajouter des tests d'autorisation. |
| Capture | `screenshots/05-sast-auth.png` |

## 5. Secret administrateur codé en dur

| Champ | Détail |
|---|---|
| Type | Secret hardcodé / credential leak |
| Localisation | `src/config.js:8` |
| Outil détecteur | Gitleaks, règle `quicknotes-admin-token`; Semgrep, règle `quicknotes.hardcoded-admin-token` |
| Extrait du log | `RuleID: quicknotes-admin-token` ; `File: src/config.js` ; `Line: 8` ; secret redacted |
| Criticité | Critique |
| Justification | Le token administrateur est stocké en clair dans le dépôt. Toute personne ayant accès au repo, aux logs ou à une image contenant ce fichier peut récupérer le secret et appeler les opérations sensibles. |
| Remédiation recommandée | Supprimer le secret du code, le stocker dans une variable d'environnement ou un secret manager, le faire tourner immédiatement, nettoyer l'historique Git si le secret a été publié, puis ajouter un scan de secrets bloquant en CI. |
| Capture | `screenshots/06-gitleaks-secret.png` |

## 6. Authentification admin par token statique partagé

| Champ | Détail |
|---|---|
| Type | Authentification faible / token statique partagé |
| Localisation | `src/routes.js:76-82` et `src/config.js:8` |
| Outil détecteur | Semgrep, règle `quicknotes.static-header-token-auth` |
| Extrait du log | `quicknotes.static-header-token-auth: Authentification admin par token statique partagé dans un header.` |
| Criticité | Moyenne |
| Justification | La purge admin repose sur un seul secret partagé dans le header `x-admin-token`. Ce mécanisme ne fournit pas d'identité utilisateur, pas de rotation robuste, pas d'expiration et pas de contrôle de rôle. Si le token fuit, l'attaquant dispose d'un accès direct à la purge. |
| Remédiation recommandée | Remplacer le token statique par une authentification standard, par exemple OAuth2/OIDC ou JWT court avec rotation, vérification de rôles et journalisation. Stocker les secrets hors du code. |
| Capture | `screenshots/05-sast-auth.png` |

## Notes de validation

- Les résultats `npm audit`, Semgrep et Gitleaks sont archivés par Jenkins dans `audit-results/`.
- Pour produire les captures une par une, utiliser les paramètres Jenkins `FAIL_ON_SCA`, `FAIL_ON_SAST` et `FAIL_ON_SECRETS` comme expliqué dans `INFRASTRUCTURE.md`.
- Les remédiations sont volontairement non appliquées dans ce rendu, car l'objectif de l'exercice est l'infrastructure CI/CD et l'audit, pas la correction du code applicatif.
