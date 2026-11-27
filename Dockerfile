# Instalação das dependências
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# === Ambiente de Desenvolvimento ===
FROM base AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
# Ajuste "dev" caso o script no seu package.json tenha outro nome
CMD ["npm", "run", "dev"]

# === Build de Produção ===
FROM base AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Ambiente de Produção
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# usuário sem privilégios, já existente na imagem oficial do Node.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]