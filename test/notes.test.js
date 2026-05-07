const request = require('supertest')
const app = require('../src/app')

describe('QuickNotes — endpoints CRUD', () => {
  it('GET /health retourne ok', async () => {
    const res = await request(app).get('/health')
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('GET /api/notes retourne un tableau', async () => {
    const res = await request(app).get('/api/notes')
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('POST /api/notes crée une note', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ title: 'Test', content: 'Contenu', author: 'jest' })
    expect(res.statusCode).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.title).toBe('Test')
  })

  it('GET /api/notes/:id retourne 404 si inexistant', async () => {
    const res = await request(app).get('/api/notes/99999')
    expect(res.statusCode).toBe(404)
  })

  it('GET /api/notes/:id retourne la note', async () => {
    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'A lire', content: 'X', author: 'jest' })
    const res = await request(app).get(`/api/notes/${created.body.id}`)
    expect(res.statusCode).toBe(200)
    expect(res.body.title).toBe('A lire')
  })

  it('DELETE /api/notes/:id supprime', async () => {
    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'A virer', content: 'X', author: 'jest' })
    const del = await request(app).delete(`/api/notes/${created.body.id}`)
    expect(del.statusCode).toBe(204)
    const get = await request(app).get(`/api/notes/${created.body.id}`)
    expect(get.statusCode).toBe(404)
  })
})
