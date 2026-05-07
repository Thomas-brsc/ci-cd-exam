# INFRASTRUCTURE — QuickNotes CI/CD

## Informations générales

| Élément | Valeur |
|---|---|
| Étudiant | Thomas Saint-Pol |
| Projet | QuickNotes API |
| Repository GitHub | `https://github.com/Thomas-brsc/eval-ci-cd-saint-pol` |
| Plateforme CI/CD | Jenkins local dans Docker |
| Plateforme de déploiement | Render |
| Service Render | `eval-ci-cd-saint-pol` |
| URL Render | `https://eval-ci-cd-saint-pol.onrender.com` |
| Healthcheck | `https://eval-ci-cd-saint-pol.onrender.com/health` |
| Notifications | Discord webhook |
| Branche suivie | `main` |

---

## 1. Schéma d’architecture

```text
+------------------+
|  Poste étudiant  |
|  VS Code + Git   |
+--------+---------+
         |
         | git push
         v
+------------------+
|   GitHub privé   |
| eval-ci-cd-...   |
+--------+---------+
         |
         | pollSCM Jenkins
         v
+-------------------------------+
| Jenkins local dans Docker     |
| http://localhost:8080         |
|                               |
| - Checkout                    |
| - Install                     |
| - Lint                        |
| - Tests                       |
| - Coverage                    |
| - SCA npm audit               |
| - SAST Semgrep                |
| - Secrets Gitleaks            |
| - Validation manuelle         |
| - Deploy Render               |
+---------+----------+----------+
          |          |
          |          | Notifications
          |          v
          |   +-------------+
          |   |   Discord   |
          |   +-------------+
          |
          | Deploy Hook
          v
+----------------------+
|        Render        |
| Web Service Docker   |
+----------+-----------+
           |
           | /health
           v
+------------------+
| QuickNotes API   |
| status: ok       |
+------------------+
```

---

## 2. Objectif de l’infrastructure

L’objectif est de mettre en place une chaîne CI/CD complète pour l’application QuickNotes.

La pipeline permet de :

- récupérer le code depuis GitHub ;
- installer les dépendances de manière reproductible ;
- exécuter le lint ;
- exécuter les tests unitaires ;
- vérifier la couverture de code ;
- analyser les dépendances avec `npm audit` ;
- analyser le code source avec Semgrep ;
- détecter les secrets avec Gitleaks ;
- notifier Discord en cas de succès ou d’échec ;
- déployer sur Render après validation manuelle ;
- vérifier que `/health` répond correctement après le déploiement.

---

## 3. Prérequis

Les outils nécessaires sont :

- Docker Desktop installé et lancé ;
- Git installé ;
- compte GitHub ;
- compte Jenkins local ;
- compte Render ;
- accès au serveur Discord de l’évaluation.

Vérification de Docker :

```powershell
docker ps
```

Si la commande fonctionne, Docker Desktop est correctement lancé.

---

## 4. Repository GitHub

Un repository privé a été créé sur GitHub :

```text
https://github.com/Thomas-brsc/eval-ci-cd-saint-pol
```

Le repository contient à la racine :

```text
Jenkinsfile
Dockerfile
INFRASTRUCTURE.md
AUDIT_SECURITE.md
.semgrep.yml
.gitleaks.toml
.dockerignore
src/
test/
package.json
package-lock.json
screenshots/
infra/
```

Le repo est branché dans Jenkins avec :

```text
Pipeline script from SCM
SCM : Git
Repository URL : https://github.com/Thomas-brsc/eval-ci-cd-saint-pol.git
Credentials : github-quicknotes
Branch Specifier : */main
Script Path : Jenkinsfile
```

---

## 5. Jenkins local dans Docker

Jenkins est exécuté localement dans Docker.

Un Dockerfile spécifique est utilisé pour construire une image Jenkins contenant la CLI Docker.

Fichier :

```text
infra/jenkins/Dockerfile
```

Contenu utilisé :

```dockerfile
FROM jenkins/jenkins:lts-jdk17

USER root

RUN apt-get update && \
    apt-get install -y ca-certificates curl gnupg git docker.io && \
    rm -rf /var/lib/apt/lists/*

USER jenkins
```

Construction de l’image Jenkins :

```powershell
cd C:\Users\PC\Documents\CI-CD-EXAM
docker build --no-cache -t quicknotes-jenkins:latest -f infra/jenkins/Dockerfile .
```

Création du volume Jenkins :

```powershell
docker volume create quicknotes_jenkins_home
```

Lancement de Jenkins :

```powershell
docker run -d `
  --name quicknotes-jenkins `
  -u root `
  -p 8080:8080 `
  -p 50000:50000 `
  -v quicknotes_jenkins_home:/var/jenkins_home `
  -v //var/run/docker.sock:/var/run/docker.sock `
  quicknotes-jenkins:latest
```

Vérification :

```powershell
docker ps
docker exec -it quicknotes-jenkins docker --version
docker exec -it quicknotes-jenkins docker ps
```

Jenkins est ensuite accessible à l’adresse :

```text
http://localhost:8080
```

---

## 6. Plugins Jenkins installés

Les plugins suivants sont nécessaires :

| Plugin | Rôle |
|---|---|
| Pipeline | Permet d’exécuter un Jenkinsfile |
| Git | Permet de cloner le repository GitHub |
| Docker Pipeline | Permet d’utiliser des agents Docker dans les stages |
| Credentials Binding | Permet d’injecter les secrets dans la pipeline |
| Pipeline Stage View | Permet de visualiser les stages |
| Blue Ocean / Pipeline Overview | Vue graphique de la pipeline |

Le plugin le plus important pour cette pipeline est `Docker Pipeline`, car les stages utilisent des agents Docker comme :

```groovy
agent {
  docker {
    image 'node:20-bookworm-slim'
  }
}
```

---

## 7. Credentials Jenkins

Les credentials suivants ont été créés dans Jenkins :

```text
Administrer Jenkins
→ Credentials
→ System
→ Global credentials
```

| ID Jenkins | Type | Usage |
|---|---|---|
| `github-quicknotes` | Username with password | Accès au repo GitHub privé |
| `discord-webhook-quicknotes` | Secret text | Envoi des notifications Discord |
| `render-deploy-hook-quicknotes` | Secret text | Déclenchement du déploiement Render |
| `render-health-url-quicknotes` | Secret text | URL de base Render pour vérifier `/health` |

Détail :

### GitHub

```text
Type : Username with password
Username : Thomas-brsc
Password : GitHub Personal Access Token
ID : github-quicknotes
```

### Discord

```text
Type : Secret text
Secret : Discord Webhook URL
ID : discord-webhook-quicknotes
```

### Render Deploy Hook

```text
Type : Secret text
Secret : Deploy Hook Render
ID : render-deploy-hook-quicknotes
```

### Render Health URL

```text
Type : Secret text
Secret : https://eval-ci-cd-saint-pol.onrender.com
ID : render-health-url-quicknotes
```

Le credential `render-health-url-quicknotes` ne contient pas `/health`, car le Jenkinsfile ajoute automatiquement `/health`.

---

## 8. Choix du déclenchement Jenkins

Le sujet précise qu’un webhook GitHub vers Jenkins local ne peut pas joindre directement Jenkins, car Jenkins tourne sur un poste local non exposé publiquement.

J’ai donc choisi `pollSCM`.

Dans le Jenkinsfile :

```groovy
triggers {
  pollSCM('H/2 * * * *')
}
```

Ce choix permet à Jenkins de vérifier régulièrement si un nouveau commit est présent sur GitHub.

Pour l’évaluation, les builds ont aussi été lancés manuellement depuis Jenkins avec :

```text
Build Now
Build with Parameters
```

Ce choix est adapté au contexte de l’exercice, car il évite d’exposer Jenkins sur Internet avec ngrok ou une configuration réseau supplémentaire.

---

## 9. Description des stages Jenkins

### 9.1 Checkout

```text
Stage : Checkout
```

Ce stage récupère le code source depuis GitHub.

Il utilise :

```groovy
checkout scm
```

Le code est ensuite stocké avec `stash` pour être réutilisé dans les stages suivants.

Objectif :

- partir du code versionné ;
- garantir que la pipeline travaille sur le contenu exact du repository ;
- éviter les fichiers parasites comme `node_modules`, `coverage` ou `audit-results`.

---

### 9.2 Install

```text
Stage : Install
```

Ce stage installe les dépendances avec :

```bash
npm ci --no-audit --no-fund
```

`npm ci` est utilisé au lieu de `npm install`, car il s’appuie strictement sur `package-lock.json`.

Objectif :

- installation reproductible ;
- détection rapide d’un lockfile incohérent ;
- éviter les variations entre deux builds.

---

### 9.3 Lint

```text
Stage : Lint
```

Ce stage exécute :

```bash
npm run lint
```

Objectif :

- vérifier la qualité minimale du code ;
- détecter les erreurs de style ou de syntaxe ;
- bloquer une pipeline si le code ne respecte pas les règles ESLint.

Résultat observé :

```text
npm run lint
OK
```

---

### 9.4 Tests

```text
Stage : Tests
```

Ce stage exécute les tests unitaires :

```bash
npm test -- --runInBand
```

Résultat observé :

```text
Test Suites: 2 passed, 2 total
Tests: 8 passed, 8 total
```

Objectif :

- vérifier que les fonctionnalités existantes ne sont pas cassées ;
- garantir un socle de non-régression avant les audits et le déploiement.

---

### 9.5 Coverage

```text
Stage : Coverage
```

Ce stage exécute :

```bash
npm run test:coverage -- --runInBand --coverageReporters=text --coverageReporters=json-summary
```

Puis il vérifie que la couverture de lignes est supérieure ou égale à `75%`.

Résultat observé :

```text
Coverage lignes: 77.33% / seuil: 75%
```

Choix du seuil :

```text
75%
```

Justification :

- seuil suffisamment exigeant pour éviter une couverture trop faible ;
- seuil réaliste pour un projet existant non modifié ;
- permet de vérifier la qualité sans bloquer artificiellement la mission CI/CD.

---

### 9.6 SCA — Software Composition Analysis

```text
Stage : SCA
```

Ce stage exécute :

```bash
npm audit --omit=dev --audit-level=moderate
```

Objectif :

- analyser les dépendances ;
- détecter les vulnérabilités connues ;
- identifier les dépendances à mettre à jour.

Résultat observé :

```text
lodash <=4.17.23
Severity: critical
1 critical severity vulnerability
```

Ce stage a permis de détecter une vulnérabilité critique dans `lodash`.

Le stage est paramétrable avec :

```text
FAIL_ON_SCA
```

Cela permet de rendre le contrôle bloquant ou non bloquant selon l’étape de l’audit.

---

### 9.7 SAST — Static Application Security Testing

```text
Stage : SAST
```

Ce stage utilise Semgrep :

```bash
semgrep scan --config .semgrep.yml --error .
```

Objectif :

- analyser statiquement le code source ;
- détecter des failles applicatives ;
- produire des logs exploitables dans `AUDIT_SECURITE.md`.

Résultat observé :

```text
Findings: 4 (4 blocking)
```

Failles détectées :

```text
quicknotes.unauthenticated-delete-note
quicknotes.reflected-xss-search
quicknotes.path-traversal-export
quicknotes.static-header-token-auth
```

Le stage est paramétrable avec :

```text
FAIL_ON_SAST
```

Cela permet de continuer la pipeline après avoir documenté les failles.

---

### 9.8 Secrets

```text
Stage : Secrets
```

Ce stage utilise Gitleaks :

```bash
gitleaks detect --no-git --source . --config .gitleaks.toml
```

Objectif :

- détecter les secrets codés en dur ;
- identifier les tokens ou credentials présents dans le code source ;
- compléter l’audit de sécurité.

Résultat observé :

```text
gitleaks
leaks found: 1
```

Le stage est paramétrable avec :

```text
FAIL_ON_SECRETS
```

Cela permet de bloquer ou non la pipeline selon l’objectif du build.

---

### 9.9 Deploy Render

```text
Stage : Deploy Render
```

Le déploiement Render est précédé d’une validation manuelle Jenkins :

```groovy
input message: 'Validation manuelle obligatoire : déployer QuickNotes sur Render ?', ok: 'Déployer'
```

Objectif :

- éviter un déploiement automatique non validé ;
- respecter la consigne de validation manuelle avant production ;
- permettre à un humain de contrôler le passage vers Render.

Après validation, Jenkins appelle le Deploy Hook Render :

```bash
curl -fsS -X POST "$RENDER_DEPLOY_HOOK"
```

Puis Jenkins vérifie le healthcheck :

```bash
curl "$RENDER_HEALTH_BASE_URL/health"
```

Résultat observé :

```json
{"status":"ok","app":"QuickNotes API"}
```

---

### 9.10 Notifications Discord

La pipeline envoie une notification Discord en cas de succès ou d’échec.

Le message contient :

- le nom du job ;
- le numéro du build ;
- le statut ;
- le nom de l’étudiant ;
- un lien Jenkins si disponible.

Exemple observé :

```text
QuickNotes CI/CD - SUCCESS
Thomas Saint-Pol - Job quicknotes-ci-cd #11
```

Capture associée :

```text
screenshots/09-discord-notification.png
```

---

## 10. Réponse à la question d’architecture obligatoire

Question :

```text
Votre Jenkins tourne dans un seul conteneur.
Comment garantissez-vous qu'un stage Tests ne pollue pas l'environnement du stage SAST,
et que les builds sont reproductibles d'une exécution à l'autre ?
```

Réponse :

Même si Jenkins tourne dans un seul conteneur, chaque stage principal de la pipeline est exécuté dans un conteneur Docker dédié grâce au plugin Docker Pipeline.

Exemples :

```groovy
agent {
  docker {
    image 'node:20-bookworm-slim'
    reuseNode false
  }
}
```

```groovy
agent {
  docker {
    image 'semgrep/semgrep:latest'
    reuseNode false
  }
}
```

Chaque stage utilise un environnement différent :

| Stage | Image Docker |
|---|---|
| Install | `node:20-bookworm-slim` |
| Lint | `node:20-bookworm-slim` |
| Tests | `node:20-bookworm-slim` |
| Coverage | `node:20-bookworm-slim` |
| SCA | `node:20-bookworm-slim` |
| SAST | `semgrep/semgrep:latest` |
| Secrets | `zricethezav/gitleaks:latest` |
| Deploy Render | `curlimages/curl:8.15.0` |

Mesures prises pour éviter la pollution entre stages :

1. `deleteDir()` est exécuté au début et à la fin des stages.
2. Le code source est récupéré via `stash` / `unstash`.
3. Les dépendances sont réinstallées avec `npm ci`.
4. Les stages tournent dans des conteneurs Docker séparés.
5. `reuseNode false` évite de réutiliser un workspace Docker contaminé.
6. Les dossiers générés comme `node_modules`, `coverage` ou `audit-results` ne sont pas propagés entre stages sauf si explicitement archivés.

Cette approche garantit qu’un stage `Tests` ne pollue pas un stage `SAST`, car Semgrep est exécuté dans son propre conteneur, avec un workspace propre et uniquement les sources nécessaires.

La reproductibilité est assurée par :

- `package-lock.json` ;
- `npm ci` ;
- des images Docker explicites ;
- la suppression régulière du workspace ;
- le versionnement du `Jenkinsfile`.

---

## 11. Conteneurisation de l’application

L’application QuickNotes est conteneurisée avec le `Dockerfile` situé à la racine du projet.

Render est configuré avec :

```text
Language : Docker
Branch : main
Instance Type : Free
```

Render construit l’application directement depuis le `Dockerfile`.

Le service est accessible à l’adresse :

```text
https://eval-ci-cd-saint-pol.onrender.com
```

Le healthcheck est disponible ici :

```text
https://eval-ci-cd-saint-pol.onrender.com/health
```

Résultat observé :

```json
{"status":"ok","app":"QuickNotes API"}
```

---

## 12. Gestion des paramètres de sécurité

La pipeline Jenkins contient trois paramètres :

```text
FAIL_ON_SCA
FAIL_ON_SAST
FAIL_ON_SECRETS
```

Ces paramètres permettent de documenter progressivement les failles.

### Premier build

```text
FAIL_ON_SCA = true
FAIL_ON_SAST = true
FAIL_ON_SECRETS = true
```

Résultat :

```text
SCA échoue sur lodash
```

### Deuxième build

```text
FAIL_ON_SCA = false
FAIL_ON_SAST = true
FAIL_ON_SECRETS = true
```

Résultat :

```text
SCA devient non bloquant
SAST échoue sur les failles applicatives
```

### Troisième build

```text
FAIL_ON_SCA = false
FAIL_ON_SAST = false
FAIL_ON_SECRETS = true
```

Résultat :

```text
SCA et SAST deviennent non bloquants
Secrets échoue sur Gitleaks
```

### Build final

```text
FAIL_ON_SCA = false
FAIL_ON_SAST = false
FAIL_ON_SECRETS = false
```

Résultat :

```text
La pipeline va jusqu’au déploiement Render
```

Ce fonctionnement respecte la logique de l’audit : les failles sont détectées, documentées, puis rendues non bloquantes temporairement pour permettre la découverte des failles suivantes et le déploiement final.

---

## 13. Captures d’écran

Les captures ont été placées dans le dossier :

```text
screenshots/
```

Liste des captures :

| Fichier | Description |
|---|---|
| `01-jenkins-job.png` | Configuration du job Jenkins |
| `02-sca-lodash.png` | Échec SCA sur `lodash` |
| `03-sast-stage.png` | Stage SAST en échec |
| `04-sast-findings.png` | Logs Semgrep avec les 4 failles |
| `05-secrets-stage.png` | Stage Secrets en échec |
| `06-gitleaks-findings.png` | Logs Gitleaks avec `leaks found: 1` |
| `07-render-health.png` | `/health` Render OK |
| `08-final-pipeline-success.png` | Pipeline finale avec Render OK |
| `09-discord-notification.png` | Notification Discord de succès |

---

## 14. Résultats observés

| Contrôle | Résultat |
|---|---|
| Checkout GitHub | OK |
| Installation npm | OK |
| Lint | OK |
| Tests unitaires | OK |
| Nombre de tests | 8 tests passés |
| Coverage | 77.33% |
| Seuil coverage | 75% |
| SCA npm audit | 1 vulnérabilité critique |
| SAST Semgrep | 4 findings |
| Secrets Gitleaks | 1 secret détecté |
| Validation manuelle | OK |
| Déploiement Render | OK |
| Healthcheck Render | OK |
| Notification Discord | OK |

---

## 15. Synthèse manager

La pipeline mise en place apporte un contrôle automatisé de la qualité et de la sécurité du projet QuickNotes.

Avant cette mise en place, le code pouvait partir en production manuellement sans test, sans audit de dépendances, sans analyse de sécurité et sans détection de secrets.

Désormais, chaque livraison passe par une chaîne contrôlée :

1. Jenkins récupère le code depuis GitHub.
2. Les dépendances sont installées proprement.
3. Le code est analysé par ESLint.
4. Les tests unitaires sont exécutés.
5. La couverture minimale est vérifiée.
6. Les dépendances vulnérables sont détectées.
7. Les failles applicatives sont remontées par Semgrep.
8. Les secrets codés en dur sont détectés par Gitleaks.
9. Le déploiement Render nécessite une validation humaine.
10. Discord reçoit une notification automatique.

La pipeline ne corrige pas les vulnérabilités à la place de l’équipe, mais elle les rend visibles, traçables et documentées. Elle réduit donc fortement le risque de déployer une version non testée ou contenant des problèmes de sécurité évidents.

Le build final prouve que l’application peut être déployée automatiquement sur Render après validation manuelle et que le endpoint `/health` répond correctement.

---

## 16. Limites et améliorations possibles

Améliorations possibles :

- rendre les scans SCA, SAST et Secrets bloquants en production ;
- corriger les vulnérabilités documentées dans `AUDIT_SECURITE.md` ;
- ajouter des tests d’intégration ;
- ajouter un scan d’image Docker ;
- ajouter une analyse OWASP ZAP dynamique ;
- ajouter une vraie gestion des environnements `dev`, `staging`, `production` ;
- utiliser des secrets Render ou un coffre de secrets dédié ;
- ajouter une protection de branche GitHub ;
- exiger une pull request validée avant merge sur `main`.

---

## 17. Conclusion

L’infrastructure CI/CD demandée a été mise en place avec Jenkins, Docker, GitHub, Discord et Render.

La pipeline exécute les contrôles attendus :

```text
Checkout
Install
Lint
Tests
Coverage
SCA
SAST
Secrets
Deploy Render
Notifications Discord
```

Les failles de sécurité ont été détectées et documentées dans :

```text
AUDIT_SECURITE.md
```

Le déploiement final sur Render est fonctionnel, et le endpoint `/health` répond correctement.
