
import Fastify from "fastify";
import cors from "@fastify/cors";

import { requireAuth } from "./middlewares/require-auth.js";
import dbPlugin from "./plugins/db.js";
import betterAuthPlugin from "./plugins/better-auth.js";

import { authController } from "./controllers/auth.controller.js";
import { replaysController } from "./controllers/replays.controller.js";
import { arenasController } from "./controllers/arenas.controller.js";
import { quadrasController } from "./controllers/quadras.controller.js";

export const app = Fastify({
  logger: true,
});

await


app.register(cors, {
  origin: "http://localhost:5173",
  credentials: true,
});

await app.register(dbPlugin);
await app.register(betterAuthPlugin);

// Autenticação legada desativada durante a integração
// app.register(authController);

app.register(replaysController);
app.register(arenasController);
app.register(quadrasController);

app.get("/health", async () => {
  return { status: "ok" };
});

app.get(
  "/teste-protegido",
  { preHandler: requireAuth },
  async () => {
    return {
      message: "Acesso autorizado!",
    };
  }
);
