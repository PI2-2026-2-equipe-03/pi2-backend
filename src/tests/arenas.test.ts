
import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { arenasController } from "../controllers/arenas.controller.js";

describe("GET /arenas", () => {
  async function criarApp() {
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: "30000000-0000-0000-0000-000000000001",
        clienteId: "10000000-0000-0000-0000-000000000001",
        nome: "Arena Mendes",
        cidade: "Belém",
        endereco: "Av. Nazaré, 100",
        fotoUrl: null,
      }],
    });

    app.decorate("pg", { query } as any);
    await app.register(arenasController);
    await app.ready();

    return { app, query };
  }

  it("retorna HTTP 200 e a lista de arenas", async () => {
    const { app } = await criarApp();

    try {
      const response = await app.inject("/arenas");

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("aplica filtro por cidade", async () => {
    const { app, query } = await criarApp();

    try {
      await app.inject("/arenas?cidade=Bel%C3%A9m");

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        ["Belém", null]
      );
    } finally {
      await app.close();
    }
  });

  it("aplica filtro por nome", async () => {
    const { app, query } = await criarApp();

    try {
      await app.inject("/arenas?q=Mendes");

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [null, "Mendes"]
      );
    } finally {
      await app.close();
    }
  });

  it("combina os dois filtros", async () => {
    const { app, query } = await criarApp();

    try {
      await app.inject("/arenas?cidade=Bel%C3%A9m&q=Mendes");

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        ["Belém", "Mendes"]
      );
    } finally {
      await app.close();
    }
  });
});
