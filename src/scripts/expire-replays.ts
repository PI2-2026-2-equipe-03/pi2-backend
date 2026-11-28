import { Pool } from 'pg'
import { expireReplays, deleteStoredMedia } from '../services/replay-retention.js'
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('Defina DATABASE_URL')
const pool = new Pool({ connectionString })
try {
  const queued = await expireReplays(pool)
  const result = await deleteStoredMedia(pool)
  console.log(JSON.stringify({ queued, ...result }))
} finally { await pool.end() }
