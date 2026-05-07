# Infrastructure CI/CD QuickNotes

> Remplacer `A_REMPLACER_PRENOM_NOM` dans le `Jenkinsfile` par vos prénom et nom avant le rendu.

## 1. Schéma d'architecture

```text
+-------------------+       git push        +-------------------------+
| Poste développeur | --------------------> | GitHub privé            |
| Docker + Git      |                       | eval-ci-cd-<votre-nom> |
+-------------------+                       +------------+------------+
                                                        |
                                                        | pollSCM toutes les ~2 min
                                                        v
+-------------------------------------------------------+------------------+
| Jenkins local dans Docker                                                |
| - Pipeline from SCM                                                      |
| - Credentials: GitHub, Discord, Render                                   |
| - Accès au daemon Docker hôte via /var/run/docker.sock                   |
+---------------+--------------------+-------------------+----------------+
                |                    |                   |
                v                    v                   v
       +----------------+   +----------------+   +------------------------+
       | Containers     |   | Containers     |   | Containers sécurité    |
       | Node 20        |   | Node 20        |   | Semgrep / Gitleaks     |
       | npm ci, lint,  |   | tests, cov,    |   | SAST + secrets         |
       | tests          |   | npm audit      |   |                        |
       +----------------+   +----------------+   +------------------------+
                |                    |                   |
                +--------------------+-------------------+
                                     |
                            validation manuelle
                                     |
                                     v
                             +---------------+
                             | Render        |
                             | Web Service   |
                             | Language Docker|
                             +-------+-------+
                                     |
                                     v
                              GET /health = 200

Jenkins envoie aussi des notifications Discord en échec et en succès.
```

## 2. Installation reproductible

### 2.1 Préparer le repo GitHub

```bash
cd projet-etudiant
# Copier à la racine les fichiers fournis dans ce rendu : Jenkinsfile, Dockerfile,
# INFRASTRUCTURE.md, AUDIT_SECURITE.md, .semgrep.yml, .gitleaks.toml, .dockerignore, infra/jenkins/Dockerfile

git init
git add .
git commit -m "Initial CI/CD QuickNotes"
git branch -M main
git remote add origin https://github.com/<votre-user>/eval-ci-cd-<votre-nom>.git
git push -u origin main
```

Le dépôt doit rester privé et doit s'appeler `eval-ci-cd-<votre-nom>`.

### 2.2 Démarrer Jenkins dans Docker avec accès au Docker hôte

Le `Jenkinsfile` utilise des agents Docker par stage. L'image Jenkins doit donc contenir le client Docker et être lancée avec le socket Docker de l'hôte.

```bash
cd eval-ci-cd-<votre-nom>

docker build -t quicknotes-jenkins:latest -f infra/jenkins/Dockerfile .
docker volume create quicknotes_jenkins_home

docker run -d \
  --name quicknotes-jenkins \
  -u root \
  -p 8080:8080 \
  -p 50000:50000 \
  -v quicknotes_jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  quicknotes-jenkins:latest

docker logs -f quicknotes-jenkins
```

Récupérer le mot de passe initial dans les logs, puis ouvrir `http://localhost:8080`.

### 2.3 Plugins Jenkins

Installer au minimum :

- **Pipeline**
- **Git**
- **Docker Pipeline**
- **Credentials Binding**
- **Blue Ocean** ou **Pipeline Stage View** pour les captures

Aucun outil Node global n'est configuré dans Jenkins : Node, Semgrep, Gitleaks et curl sont fournis par des conteneurs Docker dédiés.

### 2.4 Credentials Jenkins

Créer les credentials suivants dans `Manage Jenkins > Credentials > System > Global credentials` :

| ID Jenkins | Type | Valeur |
|---|---|---|
| `discord-webhook-quicknotes` | Secret text | Webhook Discord fourni dans le sujet |
| `render-deploy-hook-quicknotes` | Secret text | Deploy Hook du Web Service Render |
| `render-health-url-quicknotes` | Secret text | URL publique Render sans slash final, ex. `https://quicknotes-xxxx.onrender.com` |
| credential GitHub du job | Username/password ou token GitHub | Token GitHub avec accès au repo privé |

Le webhook Discord et le deploy hook Render ne sont pas écrits en clair dans le dépôt : ils sont injectés au runtime par Jenkins.

### 2.5 Job Jenkins

1. `New Item` > `Pipeline` > nom : `quicknotes-ci-cd`.
2. Section `Pipeline` : `Pipeline script from SCM`.
3. SCM : `Git`.
4. Repository URL : URL du repo privé `eval-ci-cd-<votre-nom>`.
5. Credentials : credential GitHub.
6. Branch : `*/main`.
7. Script Path : `Jenkinsfile`.
8. Sauvegarder puis lancer un premier build manuel.

## 3. Render

Créer un nouveau **Web Service Free** sur Render :

- Source : repo GitHub `eval-ci-cd-<votre-nom>`.
- Runtime / Language : **Docker**, pas Node.js.
- Dockerfile : `Dockerfile` à la racine.
- Auto Deploy : désactivé pour laisser Jenkins piloter le déploiement.
- Récupérer le **Deploy Hook** Render et le stocker dans Jenkins avec l'ID `render-deploy-hook-quicknotes`.
- Stocker l'URL publique du service dans `render-health-url-quicknotes`.

Après le stage `Deploy Render`, Jenkins vérifie automatiquement `GET /health` et attend un code HTTP `200`.

## 4. Description des stages

| Stage | Rôle | Justification |
|---|---|---|
| `Checkout` | Récupère le code depuis GitHub et le met en `stash`. | Point d'entrée unique de la pipeline depuis le SCM, conforme au mode `Pipeline script from SCM`. |
| `Install` | Exécute `npm ci`. | Vérifie que le lockfile permet une installation déterministe. |
| `Lint` | Exécute `npm run lint`. | Bloque les erreurs de qualité basiques avant les tests et les scans. |
| `Tests` | Exécute `npm test -- --runInBand`. | Valide les endpoints existants de l'API sans modifier le code applicatif. |
| `Coverage` | Exécute `npm run test:coverage -- --runInBand`, puis compare le taux de lignes au seuil. | Empêche une régression majeure de la couverture de tests. |
| `SCA` | Exécute `npm audit --omit=dev --audit-level=moderate`. | Détecte les vulnérabilités des dépendances de production. |
| `SAST` | Exécute Semgrep avec `.semgrep.yml`. | Détecte les failles applicatives plantées dans le code, de manière déterministe et versionnée. |
| `Secrets` | Exécute Gitleaks avec `.gitleaks.toml`. | Bonus : détecte les secrets codés en dur avec un outil spécialisé. |
| `Deploy Render` | Attend une validation manuelle, déclenche le deploy hook Render, puis vérifie `/health`. | Évite un déploiement automatique non validé et prouve que le service est opérationnel après déploiement. |
| `Notifications Discord` | Envoie un message en succès ou échec. | Donne au minimum le job, le numéro de build, le lien Jenkins et le nom/prénom. |

## 5. Choix techniques justifiés

### pollSCM plutôt que webhook GitHub

Jenkins tourne localement sur le poste étudiant. GitHub ne peut pas joindre directement `localhost:8080`, donc un webhook GitHub entrant n'est pas fiable sans tunnel public. J'utilise `pollSCM('H/2 * * * *')` : Jenkins interroge GitHub environ toutes les deux minutes et déclenche un build si un commit est détecté. Le build manuel reste possible pour l'évaluation.

### Seuil de couverture

Le seuil choisi est `75%` de lignes (`COVERAGE_MIN_LINES = 75`). Sur le projet fourni, la couverture locale observée est d'environ `77%` des lignes. Ce seuil est donc réaliste pour un projet legacy sans modifier le code applicatif, mais suffisamment proche de l'état actuel pour empêcher une régression nette.

### SCA

J'utilise `npm audit --omit=dev --audit-level=moderate` pour scanner les dépendances de production. Les dépendances de développement sont exclues afin de prioriser ce qui part réellement dans l'image Docker de production.

### SAST

J'utilise Semgrep avec un fichier `.semgrep.yml` versionné dans le repo. Ce choix rend la correction reproductible pendant l'évaluation : les règles ne dépendent pas d'un téléchargement externe ou d'un compte SaaS, et les messages correspondent directement aux failles attendues dans `AUDIT_SECURITE.md`.

### Scan de secrets bonus

J'utilise Gitleaks avec `.gitleaks.toml`. Semgrep sait détecter des secrets simples, mais Gitleaks est spécialisé dans les secrets et peut scanner un dépôt ou une archive de manière dédiée. La règle custom détecte le format du token admin QuickNotes.

### Déploiement Render

Le stage de déploiement utilise un **Deploy Hook** Render plutôt qu'un `scp` ou un accès serveur direct. Jenkins déclenche Render uniquement après validation manuelle, puis vérifie le healthcheck. Render construit l'application à partir du `Dockerfile` racine.

## 6. Réponse à la question d'architecture obligatoire

Jenkins tourne dans un seul conteneur, mais les stages métier ne s'exécutent pas directement dans ce conteneur. Chaque stage important utilise un **agent Docker dédié** : `node:20-bookworm-slim` pour Node, `semgrep/semgrep` pour le SAST, `zricethezav/gitleaks` pour les secrets et `curlimages/curl` pour Render.

La reproductibilité et l'isolation sont assurées par quatre mesures :

1. `agent none` au niveau global : aucun environnement implicite partagé pour toute la pipeline.
2. `reuseNode false` sur les agents Docker : Jenkins crée un contexte de stage séparé au lieu de réutiliser le même environnement d'exécution.
3. `deleteDir()` au début et à la fin des stages : le workspace du stage est nettoyé pour éviter les restes d'un build précédent.
4. `npm ci` à partir de `package-lock.json` dans chaque stage Node : les dépendances sont réinstallées de façon déterministe, sans réutiliser un `node_modules` produit par un autre stage.

Ainsi, un stage `Tests` ne peut pas polluer le stage `SAST` avec son `node_modules`, sa couverture ou des fichiers temporaires. Le code analysé par Semgrep/Gitleaks est celui récupéré depuis GitHub et remis via `stash/unstash`, pas un état bricolé par les stages précédents.

## 7. Procédure d'audit et captures

Le `Jenkinsfile` contient trois paramètres :

- `FAIL_ON_SCA`
- `FAIL_ON_SAST`
- `FAIL_ON_SECRETS`

Par défaut, ils sont à `true`, donc la pipeline bloque sur une faille. Pour produire toutes les captures demandées sans modifier le code applicatif :

1. Build 1 : laisser tout à `true`. Capturer l'échec `SCA` dû à `lodash`.
2. Build 2 : mettre `FAIL_ON_SCA=false`, garder `FAIL_ON_SAST=true`. Capturer l'échec `SAST` Semgrep.
3. Build 3 : mettre `FAIL_ON_SCA=false`, `FAIL_ON_SAST=false`, garder `FAIL_ON_SECRETS=true`. Capturer l'échec `Secrets` Gitleaks.
4. Build 4 : mettre les trois à `false` pour laisser la pipeline aller jusqu'à Render après validation manuelle. Les stages sécurité restent visibles en rouge grâce au mode audit non bloquant, mais le build peut continuer pour démontrer le déploiement.

Captures à déposer dans `screenshots/` :

| Fichier | Contenu attendu |
|---|---|
| `01-jenkins-job.png` | Configuration ou page du job Jenkins branché sur GitHub. |
| `02-sca-lodash.png` | Pipeline Overview avec le stage `SCA` en échec. |
| `03-sast-xss.png` | Stage `SAST` en échec + log Semgrep de la XSS. |
| `04-sast-path-traversal.png` | Stage `SAST` en échec + log Semgrep du path traversal. |
| `05-sast-auth.png` | Stage `SAST` en échec + log Semgrep du défaut d'authentification. |
| `06-gitleaks-secret.png` | Stage `Secrets` en échec + log Gitleaks. |
| `07-discord-notification.png` | Notification Discord contenant nom/prénom, job, build, lien. |
| `08-render-health.png` | Render ou navigateur montrant `/health` avec `200`. |

## 8. Synthèse manager

La chaîne CI/CD mise en place remplace le déploiement manuel par `scp` par un processus contrôlé et traçable. À chaque changement de code, Jenkins récupère le dépôt GitHub, installe les dépendances de manière reproductible, vérifie la qualité du code, lance les tests, mesure la couverture, audite les dépendances, recherche des failles applicatives et détecte les secrets. Les résultats sont archivés et les échecs sont notifiés sur Discord.

Le déploiement en production Render n'est pas automatique au moindre commit : il nécessite une validation humaine dans Jenkins. Après le déploiement, le healthcheck `/health` est vérifié pour confirmer que l'API répond correctement. Cette pipeline garantit donc une meilleure maîtrise du risque, une traçabilité des décisions et une base solide pour industrialiser les futurs déploiements QuickNotes.
