
import { authPool } from "../lib/auth.js";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15; // Valor provisório

export async function registrarFalha(email: string) {
  const result = await authPool.query(
    `
    WITH estado AS (
      SELECT
        id,
        CASE
          WHEN bloqueado_ate IS NOT NULL
            AND bloqueado_ate <= NOW()
          THEN 1
          ELSE LEAST(tentativas_login + 1, $2)
        END AS novas_tentativas
      FROM "user"
      WHERE lower(email) = lower($1)
        AND (
          bloqueado_ate IS NULL
          OR bloqueado_ate <= NOW()
        )
      FOR UPDATE
    )
    UPDATE "user" AS u
    SET
      tentativas_login = estado.novas_tentativas,
      bloqueado_ate = CASE
        WHEN estado.novas_tentativas >= $2
        THEN NOW() + ($3 * INTERVAL '1 minute')
        ELSE NULL
      END
    FROM estado
    WHERE u.id = estado.id
    RETURNING u.tentativas_login, u.bloqueado_ate
    `,
    [email, MAX_TENTATIVAS, BLOQUEIO_MINUTOS]
  );

  return {
    bloqueado: Boolean(result.rows[0]?.bloqueado_ate),
    tentativas: result.rows[0]?.tentativas_login ?? null,
  };
}

export async function limparTentativas(email: string) {
  await authPool.query(
    `
    UPDATE "user"
    SET tentativas_login = 0,
        bloqueado_ate = NULL
    WHERE lower(email) = lower($1)
      AND (
        bloqueado_ate IS NULL
        OR bloqueado_ate <= NOW()
      )
    `,
    [email]
  );
}
