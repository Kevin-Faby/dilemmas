# 🎯 Backend API - Application Dilemmes Quotidiens

Backend Node.js/Express/TypeScript avec PostgreSQL, Redis et Bull pour une application mobile de dilemmes quotidiens.

## 🚀 Démarrage rapide

### Prérequis

- **Node.js** 20+ 
- **Docker & Docker Compose** (recommandé)
- **PostgreSQL** 15+ (si pas Docker)
- **Redis** 7+ (si pas Docker)

### Installation avec Docker (Recommandé)

```bash
# 1. Cloner le projet
git clone <votre-repo>
cd backend

# 2. Créer le fichier .env
cp .env.example .env
# Éditez .env avec vos valeurs

# 3. Démarrer tous les services
docker-compose up -d

# 4. Appliquer les migrations Prisma
docker-compose exec backend npm run prisma:migrate

# 5. (Optionnel) Remplir avec des données de test
docker-compose exec backend npm run prisma:seed

# ✅ API disponible sur http://localhost:3000
# ✅ Prisma Studio sur http://localhost:5555
# ✅ Redis Commander sur http://localhost:8081
```

### Installation locale (sans Docker)

```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer PostgreSQL et Redis localement
# (installez-les via homebrew, apt, etc.)

# 3. Créer le fichier .env
cp .env.example .env
# Configurez DATABASE_URL avec vos identifiants

# 4. Générer le client Prisma
npm run prisma:generate

# 5. Appliquer les migrations
npm run prisma:migrate

# 6. (Optionnel) Seed
npm run prisma:seed

# 7. Démarrer en mode développement
npm run dev

# ✅ API disponible sur http://localhost:3000
```

## 📁 Structure du projet

```
backend/
├── src/
│   ├── config/              # Configuration (env, database, redis)
│   │   ├── env.ts
│   │   └── database.ts
│   ├── controllers/         # Logique des routes
│   │   ├── auth.controller.ts
│   │   ├── dilemmas.controller.ts
│   │   ├── votes.controller.ts
│   │   └── stats.controller.ts
│   ├── middleware/          # Middlewares Express
│   │   ├── auth.ts
│   │   ├── premium.ts
│   │   ├── errorHandler.ts
│   │   └── validation.ts
│   ├── routes/              # Définition des routes
│   │   ├── auth.routes.ts
│   │   ├── dilemmas.routes.ts
│   │   ├── votes.routes.ts
│   │   ├── stats.routes.ts
│   │   ├── friends.routes.ts
│   │   ├── users.routes.ts
│   │   ├── admin.routes.ts
│   │   └── sponsors.routes.ts
│   ├── services/            # Logique métier
│   │   ├── dilemma.service.ts
│   │   ├── vote.service.ts
│   │   ├── stats.service.ts
│   │   └── scheduler.service.ts
│   └── index.ts             # Point d'entrée
├── prisma/
│   ├── schema.prisma        # Schéma de base de données
│   ├── seed.ts              # Données de test
│   └── migrations/          # Historique des migrations
├── .env.example             # Template d'environnement
├── docker-compose.yml       # Configuration Docker
├── Dockerfile               # Image Docker production
├── Dockerfile.dev           # Image Docker développement
├── package.json
├── tsconfig.json
└── README.md
```

## 🔑 Variables d'environnement

Créez un fichier `.env` basé sur `.env.example`:

```env
# Essentiels
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/dilemma_db
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-super-secret-key-min-32-chars

# Optionnels
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
FIREBASE_PROJECT_ID=...
```

## 📡 API Endpoints

### Authentication

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/auth/register` | Inscription | ❌ |
| POST | `/api/auth/login` | Connexion | ❌ |
| GET | `/api/auth/profile` | Profil utilisateur | ✅ |

### Dilemmes

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/dilemmas/today` | Dilemme du jour | ✅ |
| GET | `/api/dilemmas/tomorrow` | Dilemme de demain | ✅ 👑 |
| GET | `/api/dilemmas/history` | Historique (7j free, ∞ premium) | ✅ |
| GET | `/api/dilemmas/:id` | Détails d'un dilemme | ✅ |

### Votes

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/votes` | Voter | ✅ |
| GET | `/api/votes/:dilemmaId/status` | Statut du vote | ✅ |
| GET | `/api/votes/:dilemmaId/reward` | Récupérer récompense | ✅ |
| POST | `/api/votes/reward/track` | Tracker interaction | ✅ |

### Statistiques

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| GET | `/api/stats/dilemmas/:id/global` | Stats globales | ✅ |
| GET | `/api/stats/dilemmas/:id/gender` | Stats par genre | ✅ |
| GET | `/api/stats/dilemmas/:id/age` | Stats par âge | ✅ |
| GET | `/api/stats/dilemmas/:id/friends` | Stats entre amis | ✅ |
| GET | `/api/stats/dilemmas/:id/friends/:friendId` | Stats ami spécifique | ✅ 👑 |

### Amis

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/friends/request` | Envoyer demande | ✅ |
| POST | `/api/friends/:id/accept` | Accepter demande | ✅ |
| DELETE | `/api/friends/:id` | Supprimer amitié | ✅ |
| GET | `/api/friends` | Liste des amis | ✅ |
| GET | `/api/friends/pending` | Demandes en attente | ✅ |

### Admin

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/admin/dilemmas` | Créer dilemme | ✅ 👨‍💼 |
| GET | `/api/admin/dilemmas` | Lister dilemmes | ✅ 👨‍💼 |
| PUT | `/api/admin/dilemmas/:id` | Modifier dilemme | ✅ 👨‍💼 |
| DELETE | `/api/admin/dilemmas/:id` | Supprimer dilemme | ✅ 👨‍💼 |

### Sponsors

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/sponsors` | Créer sponsor | ✅ 👨‍💼 |
| GET | `/api/sponsors` | Lister sponsors | ✅ 👨‍💼 |
| GET | `/api/sponsors/:id/analytics` | Analytics sponsor | ✅ 👨‍💼 |

**Légende:** ✅ Authentifié | 👑 Premium | 👨‍💼 Admin

## 💻 Scripts npm

```bash
# Développement
npm run dev              # Démarrer avec hot-reload
npm run prisma:studio    # Interface graphique DB
npm run lint             # Linter le code

# Production
npm run build            # Compiler TypeScript
npm start                # Démarrer (compilé)

# Base de données
npm run prisma:generate  # Générer client Prisma
npm run prisma:migrate   # Créer/appliquer migration
npm run prisma:seed      # Remplir avec données de test
npm run prisma:studio    # Interface graphique

# Autres
npm test                 # Tests (à configurer)
npm run lint             # ESLint
```

## 🗄️ Base de données

### Schéma principal

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Users    │────▶│ Friendships │◀────│    Users    │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       │ votes
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Dilemmas  │────▶│   Sponsors  │
└──────┬──────┘     └─────────────┘
       │
       │ rewards
       │
       ▼
┌──────────────────┐     ┌──────────────────────┐
│ SponsorRewards   │────▶│ RewardInteractions   │
└──────────────────┘     └──────────────────────┘
```

### Migrations

```bash
# Créer une nouvelle migration
npm run prisma:migrate -- --name nom_de_la_migration

# Appliquer les migrations
npm run prisma:migrate

# Réinitialiser la DB (⚠️ perte de données!)
npx prisma migrate reset
```

## 🔄 Système de planification

Le backend utilise **Bull** pour planifier automatiquement :

- **Publication** des dilemmes à leur date de publication
- **Révélation** des résultats à 20h pile
- **Notifications** push aux utilisateurs

```typescript
// Le scheduler démarre automatiquement avec l'application
// Voir src/services/scheduler.service.ts

// Jobs planifiés :
// - 'publish' : Publication d'un dilemme
// - 'reveal' : Révélation des résultats (20h)
// - 'daily-scheduler' : Vérification quotidienne (minuit)
```

## 📊 Cache Redis

Le backend utilise Redis pour :

- **Cache** des statistiques (TTL: 60s)
- **Cache** des dilemmes (TTL: 1h)
- **Queue** Bull pour les jobs planifiés

```typescript
// Exemple d'utilisation
import { CacheService, CACHE_KEYS } from './config/database';

// Récupérer du cache
const stats = await CacheService.get(CACHE_KEYS.STATS_GLOBAL(dilemmaId));

// Mettre en cache (60 secondes)
await CacheService.set(CACHE_KEYS.STATS_GLOBAL(dilemmaId), stats, 60);

// Invalider le cache
await CacheService.delPattern('stats:*');
```

## 🧪 Tests

```bash
# Lancer les tests (à configurer)
npm test

# Tests avec coverage
npm run test:coverage

# Tests en mode watch
npm run test:watch
```

## 🔐 Sécurité

### En développement

- CORS: `*` (tout autorisé)
- Rate limiting: 100 req/15min
- JWT: expire en 7 jours

### En production

✅ **À faire absolument:**

1. Changer `JWT_SECRET` (min 32 chars aléatoires)
2. Configurer `CORS_ORIGIN` avec votre domaine
3. Activer HTTPS uniquement
4. Utiliser des mots de passe forts pour la DB
5. Configurer un reverse proxy (nginx)
6. Activer les logs de sécurité
7. Configurer les sauvegardes DB automatiques
8. Mettre à jour régulièrement les dépendances
9. Auditer avec `npm audit`
10. Utiliser des secrets managers (AWS Secrets, etc.)

## 🚢 Déploiement

### Docker en production

```bash
# Build l'image de production
docker build -t dilemma-backend .

# Lancer avec docker-compose
docker-compose -f docker-compose.prod.yml up -d

# Voir les logs
docker-compose logs -f backend
```

### Déploiement manuel

```bash
# 1. Build
npm run build

# 2. Copier les fichiers nécessaires sur le serveur
# - dist/
# - node_modules/
# - prisma/
# - package.json

# 3. Sur le serveur
npm run prisma:generate
npm run prisma:migrate deploy
npm start
```

### Avec PM2

```bash
# Installer PM2
npm install -g pm2

# Démarrer
pm2 start dist/index.js --name dilemma-api

# Sauvegarder la config
pm2 save

# Démarrage auto au boot
pm2 startup
```

## 🐛 Troubleshooting

### Port 3000 déjà utilisé

```bash
# Trouver le processus
lsof -i :3000

# Tuer le processus
kill -9 <PID>
```

### Erreur de connexion PostgreSQL

```bash
# Vérifier que PostgreSQL tourne
docker-compose ps

# Voir les logs
docker-compose logs postgres

# Vérifier DATABASE_URL dans .env
```

### Erreur Prisma Client

```bash
# Régénérer le client
npm run prisma:generate

# Si ça ne marche pas, supprimer et réinstaller
rm -rf node_modules
npm install
```

### Redis connection refused

```bash
# Vérifier que Redis tourne
docker-compose ps redis

# Tester la connexion
redis-cli -h localhost -p 6379 ping
```

## 📚 Documentation API complète

### Exemple d'utilisation

```bash
# 1. S'inscrire
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "username": "johndoe"
  }'

# 2. Se connecter
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Réponse:
{
  "message": "Connexion réussie",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}

# 3. Utiliser le token pour les requêtes authentifiées
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 4. Récupérer le dilemme du jour
curl http://localhost:3000/api/dilemmas/today \
  -H "Authorization: Bearer $TOKEN"

# 5. Voter
curl -X POST http://localhost:3000/api/votes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dilemmaId": "uuid-du-dilemme",
    "choice": "A"
  }'
```

## 🧑‍💻 Comptes de test (après seed)

```
Admin (Premium):
  Email: admin@dilemma.com
  Password: password123

Alice (Premium):
  Email: alice@example.com
  Password: password123

Bob (Free):
  Email: bob@example.com
  Password: password123
```

## 📈 Monitoring & Logs

```bash
# Logs Docker
docker-compose logs -f backend

# Logs PM2
pm2 logs dilemma-api

# Monitoring PM2
pm2 monit
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Ouvrir une Pull Request

## 📝 License

MIT

## 📞 Support

Pour toute question : support@dilemma.com

---

**Made with ❤️ for the Dilemma App**