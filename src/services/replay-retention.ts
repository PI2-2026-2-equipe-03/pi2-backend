import type { Pool } from 'pg'
import { expirarReplaysVencidos } from '../repositories/replay.repository.js'
import { storage, thumbKeyOf, toObjectKey } from './storage.js'

// A referência ao arquivo é preservada na fila até o storage confirmar a exclusão.
export async function expireReplays(pool: Pool) {
    return expirarReplaysVencidos(pool)
}

export async function deleteStoredMedia(pool: Pool) {
    if (!storage.isConfigured()) {
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM media_deletion_job WHERE concluido_em IS NULL')

        if (rows[0].n) console.warn(`Armazenamento não configurado: ${rows[0].n} mídias pendentes de exclusão`)

        return { completed: 0, configured: false }
    }
    let completed = 0
    const failures: string[] = []
    for (let i = 0; i < 100; i++) {
        const client = await pool.connect()
        let job
        try {
            await client.query('BEGIN')
            job = (await client.query(`SELECT * FROM media_deletion_job
        WHERE concluido_em IS NULL AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= now())
        ORDER BY criado_em,id_replay LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0]
            if (!job) { await client.query('COMMIT'); break }
            const key = toObjectKey(job.arquivo_url)
            if (key) {
                await storage.remove(key)
                await storage.remove(thumbKeyOf(key))
            } else {
                // URL externa (legado): não há objeto no bucket deste backend para apagar.
                console.warn(`Mídia fora do armazenamento ignorada na exclusão: replay ${job.id_replay}`)
            }
            await client.query('UPDATE media_deletion_job SET concluido_em=now() WHERE id_replay=$1', [job.id_replay])
            await client.query('COMMIT')
            completed++
        } catch (error) {
            await client.query('ROLLBACK')
            if (!job) throw error
            await client.query(`UPDATE media_deletion_job
        SET tentativas=LEAST(tentativas+1,32767),
            proxima_tentativa_em=now()+LEAST(power(2,tentativas),1440)*INTERVAL '1 minute'
        WHERE id_replay=$1`, [job.id_replay])
            failures.push(`${job.id_replay}: ${(error as Error).message}`)
        } finally { client.release() }
    }
    if (failures.length) throw new Error(`${failures.length} exclusões no storage falharam (${failures[0]})`)
    return { completed, configured: true }
}
