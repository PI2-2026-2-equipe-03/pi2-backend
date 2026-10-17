
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { Pool } from "pg";

if (!process.env.AUTH_DATABASE_URL) {
  throw new Error("AUTH_DATABASE_URL não configurada");
}

export const authPool = new Pool({
  connectionString: process.env.AUTH_DATABASE_URL,
});

export const auth = betterAuth({
  database: authPool,

  advanced: {
    database: {
      generateId: "uuid",
    },
  },

  trustedOrigins: [
    "http://localhost:5173",
  ],

  emailAndPassword: {
    enabled: true,
  },

  session: {
    expiresIn: 60 * 60 * 24,
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": {
        window: 600,
        max: 6,
      },
    },
  },

databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        const email = user.email.trim().toLowerCase();

        const existente = await authPool.query(
          `SELECT id_usuario
           FROM usuario
           WHERE lower(email) = $1`,
          [email]
        );

        if (existente.rowCount) {
          throw new APIError("BAD_REQUEST", {
            message: "E-mail já cadastrado no sistema",
          });
        }

        return {
          data: {
            ...user,
            email,
          },
        };
      },
    },
  },
},

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") {
        return;
      }

      const email = String(
        ctx.body?.email ?? ""
      ).trim().toLowerCase();

      if (!email) return;

      const result = await authPool.query(
        `SELECT bloqueado_ate
         FROM "user"
         WHERE lower(email) = $1`,
        [email]
      );

      const usuario = result.rows[0];

      if (
        usuario?.bloqueado_ate &&
        new Date(usuario.bloqueado_ate) > new Date()
      ) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: "Conta temporariamente bloqueada",
        });
      }
    }),
  },
});
