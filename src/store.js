// Stockage en mémoire des notes (sera remplacé par PostgreSQL en v2)

const notes = []
let nextId = 1

function listNotes() {
  return notes
}

function getNote(id) {
  return notes.find((n) => n.id === Number(id))
}

function createNote({ title, content, author }) {
  const note = {
    id: nextId++,
    title: title || 'Sans titre',
    content: content || '',
    author: author || 'anonymous',
    createdAt: new Date().toISOString(),
  }
  notes.push(note)
  return note
}

function deleteNote(id) {
  const idx = notes.findIndex((n) => n.id === Number(id))
  if (idx === -1) return false
  notes.splice(idx, 1)
  return true
}

function purgeAll() {
  notes.length = 0
  nextId = 1
}

function searchNotes(query) {
  const q = (query || '').toLowerCase()
  return notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
  )
}

// Données de démo
createNote({
  title: 'Bienvenue sur QuickNotes',
  content: 'Voici votre première note de démonstration.',
  author: 'system',
})

module.exports = {
  listNotes,
  getNote,
  createNote,
  deleteNote,
  purgeAll,
  searchNotes,
}
