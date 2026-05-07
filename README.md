# QuickNotes API

> **QuickNotes** — SaaS de prise de notes collaboratives

API Node.js / Express qui propulse l'application QuickNotes. Le code a été repris suite au départ de notre ancien CTO. **Aucune intégration continue n'est en place.** Mission confiée au prestataire DevOps : sécuriser et automatiser tout le cycle de vie de cette API.

## Présentation fonctionnelle

QuickNotes permet à des utilisateurs de créer, lire, supprimer et rechercher des notes textuelles. Une route d'export legacy permet à l'équipe support de récupérer le contenu d'un fichier de notes archivé. Une route admin permet la purge complète (utilisée par la maintenance trimestrielle).

## Endpoints

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Healthcheck |
| GET | `/api/notes` | Liste toutes les notes |
| POST | `/api/notes` | Crée une note (`title`, `content`, `author`) |
| GET | `/api/notes/:id` | Récupère une note |
| DELETE | `/api/notes/:id` | Supprime une note |
| GET | `/api/search?q=` | Recherche (rendu HTML pour l'admin UI) |
| GET | `/api/export?file=` | Export d'un fichier de notes archivé |
| POST | `/api/admin/purge` | Purge totale (header `x-admin-token`) |

## Démarrage local

```bash
npm install
npm start         # http://localhost:3000
npm test          # tests Jest
npm run lint      # ESLint
```

## Stack

- Node.js 20
- Express 4
- Lodash (utilitaires de manipulation d'objets)
- Jest + Supertest (tests)
- ESLint (qualité du code)

## Identifiants techniques (interne — à externaliser)

Voir `src/config.js` pour les paramètres applicatifs (port, token admin).

---

*QuickNotes © 2026 — Document interne*
