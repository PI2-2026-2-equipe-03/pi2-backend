import type { Pool } from 'pg'

// A referência ao arquivo é preservada na fila até o storage confirmar a exclusão.
export async function expireReplays(pool: Pool) {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const expired = await client.query(`WITH expired AS (
      UPDATE replay SET status='excluido' WHERE expira_em<=now() AND status<>'excluido'
      RETURNING id_replay,arquivo_url
    ) INSERT INTO media_deletion_job(id_replay,arquivo_url,motivo)
      SELECT id_replay,arquivo_url,'Retenção de 168 horas' FROM expired WHERE arquivo_url IS NOT NULL
      ON CONFLICT(id_replay) DO NOTHING`)
        await client.query(`UPDATE replay SET arquivo_url=NULL WHERE status='excluido' AND expira_em<=now()`)
        await client.query('COMMIT')
        return expired.rowCount ?? 0
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
}

export async function deleteStoredMedia(pool: Pool) {
    if (!process.env.MEDIA_DELETE_URL) {
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM media_deletion_job WHERE concluido_em IS NULL')

        if (rows[0].n) console.warn(`MEDIA_DELETE_URL ausente: ${rows[0].n} mídias pendentes de exclusão`)

        return { completed: 0, configured: false }
    }
    const url = new URL(process.env.MEDIA_DELETE_URL)
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('MEDIA_DELETE_URL deve usar HTTPS')
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
            const response = await fetch(url, {
                method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
                headers: { 'content-type': 'application/json', ...(process.env.MEDIA_DELETE_TOKEN ? { authorization: `Bearer ${process.env.MEDIA_DELETE_TOKEN}` } : {}) },
                body: JSON.stringify({ replayId: job.id_replay, objectUrl: job.arquivo_url, reason: job.motivo }),
            })
            if (!response.ok) { await response.body?.cancel(); throw new Error('O storage não confirmou a exclusão') }
            await response.body?.cancel()
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
    if (failures.length) throw new Error(`${failures.length} exclusões falharam (${failures[0]})`)
    return { completed, configured: true }
}
