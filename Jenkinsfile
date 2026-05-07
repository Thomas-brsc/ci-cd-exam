FROM jenkins/jenkins:lts-jdk17

USER root

RUN apt-get update && \
    apt-get install -y ca-certificates curl gnupg git docker.io && \
    rm -rf /var/lib/apt/lists/*

USER jenkins