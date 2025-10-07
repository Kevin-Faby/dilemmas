# ============================================
# Dockerfile.dev - Pour le développement
# ============================================

FROM node:20-alpine

# Installer les dépendances système
RUN apk add --no-cache openssl

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY prisma ./prisma/

# Installer les dépendances
RUN npm ci

# Générer le client Prisma
RUN npm run prisma:generate

# Copier le reste du code (en dev, on utilise des volumes)
COPY . .

# Exposer le port
EXPOSE 3000

# Commande par défaut
CMD ["npm", "run", "dev"]

# ============================================
# Dockerfile - Pour la production
# ============================================

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Installer les dépendances système
RUN apk add --no-cache openssl

# Copier les fichiers de dépendances
COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./

# Installer toutes les dépendances (dev + prod)
RUN npm ci

# Générer le client Prisma
RUN npm run prisma:generate

# Copier le code source
COPY src ./src

# Build TypeScript
RUN npm run build

# Nettoyer les dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Installer les dépendances système
RUN apk add --no-cache openssl dumb-init

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copier les fichiers nécessaires depuis le builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Utiliser l'utilisateur non-root
USER nodejs

# Exposer le port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Utiliser dumb-init pour gérer les signaux correctement
ENTRYPOINT ["dumb-init", "--"]

# Démarrer l'application
CMD ["node", "dist/index.js"]