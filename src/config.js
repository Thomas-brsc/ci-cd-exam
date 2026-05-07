// Configuration de l'application QuickNotes
const config = {
  port: process.env.PORT || 3000,
  appName: 'QuickNotes API',

  // Token administrateur pour les opérations sensibles (purge, export)
  // ⚠ Ce token est utilisé par le script de maintenance /api/admin/purge
  ADMIN_TOKEN: 'qn_admin_2026_S3cr3t!',

  exportDir: './exports',
}

module.exports = config
