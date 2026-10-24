
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { resolve } from "node:path";

import { requireAuth } from "./middlewares/require-auth.js";
import dbPlugin from "./plugins/db.js";
import betterAuthPlugin from "./plugins/better-auth.js";

import { replaysController } from "./controllers/replays.controller.js";
import { arenasController } from "./controllers/arenas.controller.js";
import { quadrasController } from "./controllers/quadras.controller.js";

export const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: "http://localhost:5173",
  credentials: true,
});

await app.register(dbPlugin);
await app.register(betterAuthPlugin);

// Carrega o contrato OpenAPI definido em docs/openapi.yaml.

await app.register(swagger, {
  mode: "static",
  specification: {
    path: "./docs/openapi.yaml",
    baseDir: resolve(),
  },
});

await app.register(swaggerUi, {
  routePrefix: "/api-docs",
  uiConfig: {
    url: "/api-docs/json",
    docExpansion: "list",
    deepLinking: false,
  },
});

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
