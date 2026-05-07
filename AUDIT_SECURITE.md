# AUDIT DE SÉCURITÉ — QuickNotes

## Contexte

Ce document présente les failles détectées automatiquement par la pipeline CI/CD Jenkins mise en place pour QuickNotes.

Conformément à la consigne, le code applicatif n’a pas été corrigé. L’objectif est de détecter, comprendre et documenter les problèmes de sécurité, pas de les patcher directement dans le cadre de cet exercice.

---

## Synthèse des failles détectées

| # | Type | Localisation | Outil détecteur | Criticité |
|---|---|---|---|---|
| 1 | Dépendance vulnérable lodash | `package-lock.json`, `node_modules/lodash` | `npm audit` | Critique |
| 2 | Route DELETE sans authentification | `src/routes.js:35-39` | Semgrep | Haute |
| 3 | XSS reflétée | `src/routes.js:57` | Semgrep | Haute |
| 4 | Path traversal | `src/routes.js:68` | Semgrep | Haute |
| 5 | Authentification admin par token statique | `src/routes.js:78-80` | Semgrep | Haute |
| 6 | Secret administrateur codé en dur | `src/config.js:8` | Gitleaks | Critique |

---

# Faille 1 — Dépendance vulnérable lodash

| Champ | Détail |
|---|---|
| Type | Dépendance npm vulnérable / SCA |
| Localisation | `package-lock.json`, `node_modules/lodash` |
| Outil détecteur | `npm audit --omit=dev --audit-level=moderate` |
| Extrait du log | `lodash <=4.17.23`, `Severity: critical`, `Prototype Pollution`, `Command Injection`, `Regular Expression Denial of Service`, `1 critical severity vulnerability` |
| Criticité | Critique |
| Justification | La dépendance `lodash` installée contient plusieurs vulnérabilités connues. Les vulnérabilités détectées incluent notamment de la pollution de prototype, de l’injection de commande et du déni de service par expression régulière. Comme cette dépendance est présente dans l’application, elle représente un risque important si elle est utilisée sur des entrées contrôlées par un utilisateur. |
| Remédiation recommandée | Mettre à jour `lodash` vers une version corrigée compatible avec le projet, puis relancer `npm audit`, les tests unitaires et la couverture de code. |
| Capture associée | `screenshots/02-sca-lodash.png` |

---

# Faille 2 — Route DELETE sans authentification

| Champ | Détail |
|---|---|
| Type | Contrôle d’accès manquant / Broken Access Control |
| Localisation | `src/routes.js:35-39` |
| Outil détecteur | Semgrep — règle `quicknotes.unauthenticated-delete-note` |
| Extrait du log | `Route DELETE destructive sans contrôle d'authentification visible.` |
| Criticité | Haute |
| Justification | La route `DELETE /api/notes/:id` permet de supprimer une note sans contrôle d’authentification ou d’autorisation visible. Un attaquant capable d’appeler l’API pourrait supprimer des données sans être connecté ou sans posséder la note ciblée. |
| Remédiation recommandée | Ajouter une authentification obligatoire, vérifier les permissions de l’utilisateur, contrôler la propriété de la note et journaliser les opérations destructives. |
| Capture associée | `screenshots/03-sast-stage.png`, `screenshots/04-sast-findings.png` |

---

# Faille 3 — XSS reflétée

| Champ | Détail |
|---|---|
| Type | XSS reflétée |
| Localisation | `src/routes.js:57` |
| Outil détecteur | Semgrep — règle `quicknotes.reflected-xss-search` |
| Extrait du log | `Entrée utilisateur rendue dans du HTML sans échappement: risque de XSS reflétée.` |
| Criticité | Haute |
| Justification | Une entrée utilisateur provenant de la query string est réinjectée dans une réponse HTML sans échappement. Un attaquant pourrait créer un lien piégé contenant du JavaScript. Si une victime ouvre ce lien, le script pourrait s’exécuter dans son navigateur. |
| Remédiation recommandée | Échapper systématiquement les sorties HTML avec une librairie adaptée, utiliser un moteur de templates avec auto-escape, ou éviter de générer du HTML manuellement à partir d’entrées utilisateur. |
| Capture associée | `screenshots/03-sast-stage.png`, `screenshots/04-sast-findings.png` |

---

# Faille 4 — Path traversal sur l’export

| Champ | Détail |
|---|---|
| Type | Path traversal / lecture arbitraire de fichier |
| Localisation | `src/routes.js:68` |
| Outil détecteur | Semgrep — règle `quicknotes.path-traversal-export` |
| Extrait du log | `Lecture de fichier construite depuis une query string: risque de path traversal.` |
| Criticité | Haute |
| Justification | Le chemin du fichier lu est construit à partir d’un paramètre utilisateur. Sans validation stricte, un attaquant pourrait tenter d’utiliser des chemins comme `../` pour accéder à des fichiers hors du répertoire prévu. |
| Remédiation recommandée | Valider les noms de fichiers avec une allowlist, refuser les chemins contenant `..`, normaliser avec `path.resolve`, puis vérifier que le chemin final reste dans le dossier autorisé. |
| Capture associée | `screenshots/03-sast-stage.png`, `screenshots/04-sast-findings.png` |

---

# Faille 5 — Authentification admin par token statique

| Champ | Détail |
|---|---|
| Type | Authentification faible / token statique partagé |
| Localisation | `src/routes.js:78-80` |
| Outil détecteur | Semgrep — règle `quicknotes.static-header-token-auth` |
| Extrait du log | `Authentification admin par token statique partagé dans un header.` |
| Criticité | Haute |
| Justification | La fonctionnalité d’administration repose sur un token statique transmis dans un header. Si ce token est découvert ou partagé, un attaquant peut accéder aux fonctionnalités administrateur. Ce mécanisme ne fournit pas de vraie identité utilisateur, pas de rotation automatique et pas de gestion fine des rôles. |
| Remédiation recommandée | Remplacer le token statique par une authentification robuste, par exemple sessions sécurisées, JWT courts avec rotation, OAuth2/OIDC, contrôle de rôle et journalisation des actions sensibles. |
| Capture associée | `screenshots/03-sast-stage.png`, `screenshots/04-sast-findings.png` |

---

# Faille 6 — Secret administrateur codé en dur

| Champ | Détail |
|---|---|
| Type | Secret hardcodé / fuite de credential |
| Localisation | `src/config.js:8` |
| Outil détecteur | Gitleaks |
| Extrait du log | `gitleaks`, `leaks found: 1` |
| Criticité | Critique |
| Justification | Un token administrateur est présent directement dans le code source. Toute personne ayant accès au dépôt, aux logs ou à une image contenant ce fichier peut potentiellement récupérer ce secret et l’utiliser pour accéder à des fonctionnalités sensibles. |
| Remédiation recommandée | Supprimer le secret du code, le stocker dans une variable d’environnement ou un gestionnaire de secrets, faire une rotation immédiate du token exposé et vérifier l’historique Git pour s’assurer que le secret n’est plus récupérable. |
| Capture associée | `screenshots/05-secrets-stage.png`, `screenshots/06-gitleaks-findings.png` |

---

## Résultats de pipeline associés

| Élément vérifié | Résultat |
|---|---|
| Tests unitaires | `8 passed, 8 total` |
| Couverture de code | `77.33%`, seuil choisi : `75%` |
| SCA | Échec attendu sur `lodash` |
| SAST | 4 findings Semgrep détectés |
| Secrets | 1 secret détecté par Gitleaks |
| Déploiement Render | Succès après validation manuelle Jenkins |
| Healthcheck Render | `/health` répond `200` |
| Notification Discord | Notification de succès reçue |

---

## Captures disponibles

| Capture | Description |
|---|---|
| `screenshots/02-sca-lodash.png` | Échec SCA sur `lodash` |
| `screenshots/03-sast-stage.png` | Stage SAST en échec dans Jenkins |
| `screenshots/04-sast-findings.png` | Logs Semgrep avec les 4 failles |
| `screenshots/05-secrets-stage.png` | Stage Secrets en échec dans Jenkins |
| `screenshots/06-gitleaks-findings.png` | Log Gitleaks avec `leaks found: 1` |
| `screenshots/07-render-health.png` | `/health` Render répond correctement |
| `screenshots/08-final-pipeline-success.png` | Pipeline finale avec déploiement Render réussi |
| `screenshots/09-discord-notification.png` | Notification Discord de succès |

---

## Conclusion

La pipeline CI/CD met en évidence plusieurs problèmes de sécurité significatifs dans QuickNotes : dépendance vulnérable, failles applicatives détectées par analyse statique, secret codé en dur et mécanisme d’authentification faible.

La chaîne Jenkins permet de détecter automatiquement ces problèmes avant un déploiement. Les contrôles peuvent être rendus bloquants ou non bloquants grâce aux paramètres `FAIL_ON_SCA`, `FAIL_ON_SAST` et `FAIL_ON_SECRETS`, ce qui a permis de documenter chaque faille progressivement puis d’aller jusqu’au déploiement final sur Render après validation manuelle.