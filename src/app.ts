
import Fastify from "fastify";
import replayRetentionPlugin from "./plugins/replay-retention.js";
import { passwordRecoveryController } from "./controllers/password-recovery.controller.js";
import { registerErrorHandler } from "./http/errors.js";
import { managementController } from "./controllers/management.controller.js";
import cors from "@fastify/cors";

import { requireAuth } from "./middlewares/require-auth.js";
import dbPlugin from "./plugins/db.js";
import betterAuthPlugin from "./plugins/better-auth.js";

import { authController } from "./controllers/auth.controller.js";
import { replaysController } from "./controllers/replays.controller.js";
import { arenasController } from "./controllers/arenas.controller.js";
import { quadrasController } from "./controllers/quadras.controller.js";

import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import openapiPlugin from './plugins/openapi.js'

export const app = Fastify({ logger: true, });

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

registerErrorHandler(app);

await app.register(cors, { origin: "http://localhost:5173", credentials: true, });
await app.register(dbPlugin);
await app.register(openapiPlugin)
await app.register(replayRetentionPlugin);
await app.register(betterAuthPlugin);

await app.register(authController);
await app.register(replaysController);
await app.register(arenasController);
await app.register(quadrasController);
await app.register(managementController);
await app.register(passwordRecoveryController);

app.get("/health", { schema: { hide: true } }, async () => {
  return { status: "ok" };
});

app.get(
  "/teste-protegido",
  { preHandler: requireAuth, schema: { hide: true } },
  async () => {
    return {
      message: "Acesso autorizado!",
    };
  }
);
