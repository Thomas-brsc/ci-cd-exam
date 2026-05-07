const request = require('supertest')
const app = require('../src/app')

describe('QuickNotes — recherche', () => {
  it('GET /api/search répond du HTML', async () => {
    const res = await request(app).get('/api/search?q=bienvenue')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  it('GET /api/search sans query renvoie une page', async () => {
    const res = await request(app).get('/api/search')
    expect(res.statusCode).toBe(200)
  })
})
