import groovy.json.JsonOutput

/*
 * QuickNotes - Pipeline Jenkins CI/CD
 */

def securityGate(String label, String command, boolean blocking) {
  if (blocking) {
    sh(label: label, script: command)
  } else {
    catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
      sh(label: "${label} (audit non bloquant)", script: command)
    }
  }
}

def notifyDiscord(String status) {
  node {
    def buildUrl = env.BUILD_URL ?: 'URL Jenkins locale indisponible'
    def color = status == 'SUCCESS' ? 3066993 : 15158332

    def payload = JsonOutput.toJson([
      username: 'Jenkins QuickNotes',
      embeds: [[
        title: "QuickNotes CI/CD - ${status}",
        color: color,
        description: "${env.STUDENT_NAME} - Job ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        fields: [
          [name: 'Job', value: env.JOB_NAME ?: 'unknown', inline: true],
          [name: 'Build', value: "#${env.BUILD_NUMBER}", inline: true],
          [name: 'Lien Jenkins', value: buildUrl, inline: false]
        ]
      ]]
    ])

    writeFile file: 'discord_payload.json', text: payload

    withCredentials([string(credentialsId: 'discord-webhook-quicknotes', variable: 'DISCORD_WEBHOOK_URL')]) {
      sh '''#!/usr/bin/env bash
        set -euo pipefail

        CLEAN_WEBHOOK_URL="$(printf '%s' "$DISCORD_WEBHOOK_URL" | tr -d '\\r\\n ')"

        curl -fsS \
          -H 'Content-Type: application/json' \
          --data @discord_payload.json \
          "$CLEAN_WEBHOOK_URL" >/dev/null
      '''
    }
  }
}

pipeline {
  agent none

  options {
    skipDefaultCheckout(true)
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '10'))
  }

  triggers {
    pollSCM('H/2 * * * *')
  }

  parameters {
    booleanParam(name: 'FAIL_ON_SCA', defaultValue: true, description: 'Bloque la pipeline si npm audit détecte une vulnérabilité.')
    booleanParam(name: 'FAIL_ON_SAST', defaultValue: true, description: 'Bloque la pipeline si Semgrep détecte une faille applicative.')
    booleanParam(name: 'FAIL_ON_SECRETS', defaultValue: true, description: 'Bloque la pipeline si Gitleaks détecte un secret.')
  }

  environment {
    STUDENT_NAME = 'Thomas Saint-Pol'
    COVERAGE_MIN_LINES = '75'
  }

  stages {
    stage('Checkout') {
      agent any
      steps {
        deleteDir()
        checkout scm
        stash name: 'source',
          includes: '**/*,.eslintrc.json,.gitignore,.semgrep.yml,.gitleaks.toml,.dockerignore',
          excludes: '.git/**,node_modules/**,coverage/**,audit-results/**,screenshots/**'
      }
    }

    stage('Install') {
      agent {
        docker {
          image 'node:20-bookworm-slim'
          args '-e HOME=/tmp -e npm_config_cache=/tmp/npm-cache'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        sh 'npm ci --no-audit --no-fund'
      }
      post {
        always {
          deleteDir()
        }
      }
    }

    stage('Lint') {
      agent {
        docker {
          image 'node:20-bookworm-slim'
          args '-e HOME=/tmp -e npm_config_cache=/tmp/npm-cache'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        sh 'npm ci --no-audit --no-fund'
        sh 'npm run lint'
      }
      post {
        always {
          deleteDir()
        }
      }
    }

    stage('Tests') {
      agent {
        docker {
          image 'node:20-bookworm-slim'
          args '-e HOME=/tmp -e npm_config_cache=/tmp/npm-cache'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        sh 'npm ci --no-audit --no-fund'
        sh 'npm test -- --runInBand'
      }
      post {
        always {
          deleteDir()
        }
      }
    }

    stage('Coverage') {
      agent {
        docker {
          image 'node:20-bookworm-slim'
          args '-e HOME=/tmp -e npm_config_cache=/tmp/npm-cache'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        sh 'npm ci --no-audit --no-fund'
        sh 'npm run test:coverage -- --runInBand --coverageReporters=text --coverageReporters=json-summary'
        sh '''#!/usr/bin/env bash
          set -euo pipefail
          node -e "const fs=require('fs'); const threshold=Number(process.env.COVERAGE_MIN_LINES||75); const summary=JSON.parse(fs.readFileSync('coverage/coverage-summary.json','utf8')); const lines=summary.total.lines.pct; console.log('Coverage lignes: '+lines+'% / seuil: '+threshold+'%'); if(lines<threshold){ console.error('Coverage insuffisante: '+lines+'% < '+threshold+'%'); process.exit(1); }"
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
          deleteDir()
        }
      }
    }

    stage('SCA') {
      agent {
        docker {
          image 'node:20-bookworm-slim'
          args '-e HOME=/tmp -e npm_config_cache=/tmp/npm-cache'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        sh 'npm ci --no-fund'
        script {
          securityGate('SCA - npm audit', '''#!/usr/bin/env bash
            set +e
            mkdir -p audit-results
            npm audit --omit=dev --audit-level=moderate > audit-results/npm-audit.txt 2>&1
            status=$?
            cat audit-results/npm-audit.txt
            exit $status
          ''', params.FAIL_ON_SCA)
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'audit-results/npm-audit.txt', allowEmptyArchive: true
          deleteDir()
        }
      }
    }

    stage('SAST') {
      agent {
        docker {
          image 'semgrep/semgrep:latest'
          args '--entrypoint= -u root'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        script {
          securityGate('SAST - Semgrep', '''#!/usr/bin/env sh
            set +e
            mkdir -p audit-results

            semgrep scan \
              --config .semgrep.yml \
              --json \
              --output audit-results/semgrep.json \
              . >/tmp/semgrep-json.log 2>&1

            semgrep scan \
              --config .semgrep.yml \
              --error \
              . > audit-results/semgrep.txt 2>&1

            status=$?
            cat audit-results/semgrep.txt
            exit $status
          ''', params.FAIL_ON_SAST)
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'audit-results/semgrep.*', allowEmptyArchive: true
          deleteDir()
        }
      }
    }

    stage('Secrets') {
      agent {
        docker {
          image 'zricethezav/gitleaks:latest'
          args '--entrypoint= -u root'
          reuseNode false
        }
      }
      steps {
        deleteDir()
        unstash 'source'
        script {
          securityGate('Secrets - Gitleaks', '''#!/usr/bin/env sh
            set +e
            mkdir -p audit-results

            gitleaks detect \
              --no-git \
              --source . \
              --config .gitleaks.toml \
              --redact=20 \
              --report-format json \
              --report-path audit-results/gitleaks.json \
              > audit-results/gitleaks.txt 2>&1

            status=$?
            cat audit-results/gitleaks.txt
            exit $status
          ''', params.FAIL_ON_SECRETS)
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'audit-results/gitleaks.*', allowEmptyArchive: true
          deleteDir()
        }
      }
    }

    stage('Deploy Render') {
      agent {
        docker {
          image 'curlimages/curl:8.15.0'
          args '--entrypoint='
          reuseNode false
        }
      }
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          input message: 'Validation manuelle obligatoire : déployer QuickNotes sur Render ?', ok: 'Déployer'
        }

        withCredentials([
          string(credentialsId: 'render-deploy-hook-quicknotes', variable: 'RENDER_DEPLOY_HOOK'),
          string(credentialsId: 'render-health-url-quicknotes', variable: 'RENDER_HEALTH_BASE_URL')
        ]) {
          sh '''#!/usr/bin/env sh
            set -eu

            curl -fsS -X POST "$RENDER_DEPLOY_HOOK" >/dev/null

            for i in $(seq 1 60); do
              code=$(curl -sS -o /tmp/quicknotes-health.txt -w '%{http_code}' "$RENDER_HEALTH_BASE_URL/health" || true)

              if [ "$code" = "200" ]; then
                echo "Healthcheck Render OK: $RENDER_HEALTH_BASE_URL/health"
                exit 0
              fi

              sleep 10
            done

            echo "Healthcheck Render KO après déploiement"
            cat /tmp/quicknotes-health.txt || true
            exit 1
          '''
        }
      }
    }
  }

  post {
    failure {
      script {
        notifyDiscord('FAILURE')
      }
    }

    success {
      script {
        notifyDiscord('SUCCESS')
      }
    }
  }
}