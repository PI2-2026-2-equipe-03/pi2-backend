
import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { quadrasController } from "../controllers/quadras.controller.js";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

describe("GET /quadras", () => {
  async function criarApp() {
    const app = Fastify();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "40000000-0000-0000-0000-000000000006",
          arenaId: "30000000-0000-0000-0000-000000000006",
          nome: "Quadra 01",
          disponivel: false,
        },
      ],
    });

    app.decorate("pg", { query } as any);
    await app.register(quadrasController);
    await app.ready();

    return { app, query };
  }

  it("retorna HTTP 200 com a lista de quadras", async () => {
    const { app } = await criarApp();

    try {
      const response = await app.inject("/quadras");

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("filtra por arenaId", async () => {
    const { app, query } = await criarApp();
    const arenaId = "30000000-0000-0000-0000-000000000006";

    try {
      await app.inject(`/quadras?arenaId=${arenaId}`);

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [arenaId, null]
      );
    } finally {
      await app.close();
    }
  });

  it("filtra por disponibilidade false", async () => {
    const { app, query } = await criarApp();

    try {
      await app.inject("/quadras?disponivel=false");

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [null, false]
      );
    } finally {
      await app.close();
    }
  });

  it("combina arenaId e disponibilidade", async () => {
    const { app, query } = await criarApp();
    const arenaId = "30000000-0000-0000-0000-000000000006";

    try {
      await app.inject(
        `/quadras?arenaId=${arenaId}&disponivel=false`
      );

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [arenaId, false]
      );
    } finally {
      await app.close();
    }
  });

  it("rejeita disponibilidade inválida", async () => {
    const { app, query } = await criarApp();

    try {
      const response = await app.inject(
        "/quadras?disponivel=talvez"
      );

      expect(response.statusCode).toBe(400);
      expect(query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("rejeita arenaId inválido", async () => {
    const { app, query } = await criarApp();

    try {
      const response = await app.inject(
        "/quadras?arenaId=invalido"
      );

      expect(response.statusCode).toBe(400);
      expect(query).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("retorna lista vazia quando não há resultados", async () => {
    const { app, query } = await criarApp();
    query.mockResolvedValueOnce({ rows: [] });

    try {
      const response = await app.inject(
        "/quadras?disponivel=true"
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: [] });
    } finally {
      await app.close();
    }
  });
});
