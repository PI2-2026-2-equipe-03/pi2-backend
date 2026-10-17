
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth, authPool } from "../lib/auth.js";
import {
  registrarFalha,
  limparTentativas,
} from "../services/account-lockout.js";

export default fp(async (app: FastifyInstance) => {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",

    async handler(request, reply) {
      const url = new URL(
        request.url,
        process.env.BETTER_AUTH_URL
      );

      const headers = fromNodeHeaders(request.headers);

      const req = new Request(url, {
        method: request.method,
        headers,
        ...(request.method !== "GET"
          ? { body: JSON.stringify(request.body ?? {}) }
          : {}),
      });

      const isLogin =
        request.method === "POST" &&
        url.pathname === "/api/auth/sign-in/email";

      const body = request.body as
        | { email?: string }
        | undefined;

      const email =
        typeof body?.email === "string"
          ? body.email.trim().toLowerCase()
          : "";

      // Outros endpoints continuam funcionando normalmente.
      if (!isLogin || !email) {
        const response = await auth.handler(req);

        reply.status(response.status);

        response.headers.forEach((value, key) => {
          reply.header(key, value);
        });

        return reply.send(
          response.body
            ? await response.text()
            : null
        );
      }

      // Uma tentativa por vez para o mesmo e-mail.
      const client = await authPool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `SELECT pg_advisory_xact_lock(
             hashtextextended($1, 0)
           )`,
          [email]
        );

        const response = await auth.handler(req);

        if (response.status === 401) {
          const payload = await response
            .clone()
            .json()
            .catch(() => null);

          if (payload?.code === "INVALID_EMAIL_OR_PASSWORD") {
            const resultado = await registrarFalha(email);

            if (resultado.bloqueado) {
              await client.query("COMMIT");

              return reply.code(429).send({
                message: "Conta temporariamente bloqueada",
              });
            }
          }
        } else if (response.ok) {
          await limparTentativas(email);
        }

        await client.query("COMMIT");

        reply.status(response.status);

        response.headers.forEach((value, key) => {
          reply.header(key, value);
        });

        return reply.send(
          response.body
            ? await response.text()
            : null
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  });
});
