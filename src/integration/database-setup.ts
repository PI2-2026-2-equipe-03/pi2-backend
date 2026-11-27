import { readdir, readFile } from 'node:fs/promises'
import type { Pool } from 'pg'

// Aplica as migrações (src/db/init) e depois o seed sintético (src/db/seed),
// na mesma ordem usada pelo Postgres do docker compose em dev.
const scriptDirs = [new URL('../db/init/', import.meta.url), new URL('../db/seed/', import.meta.url)]

export async function applyDatabaseScripts(db: Pool) {
    for (const dir of scriptDirs) {
        for (const file of (await readdir(dir)).filter(file => file.endsWith('.sql')).sort()) {
            await db.query(await readFile(new URL(file, dir), 'utf8'))
        }
    }
}
