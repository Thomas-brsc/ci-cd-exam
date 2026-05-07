const express = require('express')
const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const config = require('./config')
const store = require('./store')

const router = express.Router()

// --- Healthcheck ---
router.get('/health', (req, res) => {
  res.json({ status: 'ok', app: config.appName })
})

// --- Liste des notes ---
router.get('/api/notes', (req, res) => {
  res.json(store.listNotes())
})

// --- Création d'une note ---
router.post('/api/notes', (req, res) => {
  const payload = _.pick(req.body, ['title', 'content', 'author'])
  const note = store.createNote(payload)
  res.status(201).json(note)
})

// --- Lecture d'une note ---
router.get('/api/notes/:id', (req, res) => {
  const note = store.getNote(req.params.id)
  if (!note) return res.status(404).json({ error: 'not found' })
  res.json(note)
})

// --- Suppression ---
router.delete('/api/notes/:id', (req, res) => {
  const ok = store.deleteNote(req.params.id)
  if (!ok) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// --- Recherche (rendu HTML pour l'admin UI legacy) ---
router.get('/api/search', (req, res) => {
  const q = req.query.q || ''
  const results = store.searchNotes(q)
  // Rendu HTML simple pour l'interface d'administration
  const html = `
    <!DOCTYPE html>
    <html><head><title>Recherche QuickNotes</title></head>
    <body>
      <h1>Résultats pour : ${q}</h1>
      <p>${results.length} note(s) trouvée(s)</p>
      <ul>
        ${results.map((n) => `<li>${n.title}</li>`).join('')}
      </ul>
    </body></html>
  `
  res.send(html)
})

// --- Export d'une note vers un fichier (feature legacy maintenance) ---
router.get('/api/export', (req, res) => {
  const file = req.query.file || 'last.txt'
  const fullPath = path.join(config.exportDir, file)
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'export file not found' })
    }
    const content = fs.readFileSync(fullPath, 'utf8')
    res.type('text/plain').send(content)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// --- Purge admin (token-based auth) ---
router.post('/api/admin/purge', (req, res) => {
  const token = req.headers['x-admin-token']
  if (token !== config.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'forbidden' })
  }
  store.purgeAll()
  res.json({ status: 'purged' })
})

module.exports = router
