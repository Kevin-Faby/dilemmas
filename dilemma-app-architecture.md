# Architecture Complète - Application Dilemmes Quotidiens

## 📋 Table des matières
1. [Vue d'ensemble](#vue-densemble)
2. [Base de données (Prisma)](#base-de-données)
3. [Backend API (Node.js)](#backend-api)
4. [Admin Panel (React)](#admin-panel)
5. [Application Mobile (Flutter)](#application-mobile)
6. [Système de planification](#système-de-planification)
7. [Déploiement](#déploiement)

---

## 🏗️ Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Flutter    │    │    React     │    │  Node.js API │ │
│  │   Mobile     │───▶│    Admin     │───▶│   Express    │ │
│  │     App      │    │    Panel     │    │  TypeScript  │ │
│  └──────────────┘    └──────────────┘    └──────┬───────┘ │
│                                                  │         │
│                                         ┌────────▼───────┐ │
│                                         │  PostgreSQL    │ │
│                                         │  + Redis Cache │ │
│                                         └────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Services Tiers                               │  │
│  │  • RevenueCat (abonnements)                          │  │
│  │  • Firebase Cloud Messaging (notifications)          │  │
│  │  • AWS S3 (stockage images sponsors)                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 💾 Base de données

### Schema Prisma (prisma/schema.prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// UTILISATEURS
// ============================================

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String   @map("password_hash")
  username      String   @unique
  
  // Données démographiques (optionnelles)
  birthDate     DateTime? @map("birth_date")
  gender        Gender?
  region        String?   // Code région/pays
  
  // Premium
  isPremium     Boolean  @default(false) @map("is_premium")
  premiumUntil  DateTime? @map("premium_until")
  
  // Métadonnées
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  lastLoginAt   DateTime? @map("last_login_at")
  
  // Relations
  votes         Vote[]
  friendshipsInitiated Friendship[] @relation("UserFriendships")
  friendshipsReceived  Friendship[] @relation("FriendFriendships")
  rewardInteractions   RewardInteraction[]
  
  @@map("users")
}

enum Gender {
  MALE
  FEMALE
  OTHER
  PREFER_NOT_TO_SAY
}

// ============================================
// AMIS
// ============================================

model Friendship {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  friendId   String   @map("friend_id")
  status     FriendshipStatus @default(PENDING)
  createdAt  DateTime @default(now()) @map("created_at")
  
  user       User     @relation("UserFriendships", fields: [userId], references: [id], onDelete: Cascade)
  friend     User     @relation("FriendFriendships", fields: [friendId], references: [id], onDelete: Cascade)
  
  @@unique([userId, friendId])
  @@index([userId])
  @@index([friendId])
  @@map("friendships")
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}

// ============================================
// DILEMMES
// ============================================

model Dilemma {
  id           String   @id @default(uuid())
  question     String
  optionA      String   @map("option_a")
  optionB      String   @map("option_b")
  
  // Planification
  publishDate  DateTime @map("publish_date") // Date de publication
  revealTime   DateTime @map("reveal_time")  // Heure de révélation (20h)
  
  // Sponsoring
  isSponsored  Boolean  @default(false) @map("is_sponsored")
  sponsorId    String?  @map("sponsor_id")
  
  // Métadonnées
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  // Relations
  sponsor      Sponsor?  @relation(fields: [sponsorId], references: [id])
  votes        Vote[]
  rewards      SponsorReward[]
  
  @@index([publishDate])
  @@index([sponsorId])
  @@map("dilemmas")
}

// ============================================
// VOTES
// ============================================

model Vote {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  dilemmaId  String   @map("dilemma_id")
  choice     Choice   // A ou B
  votedAt    DateTime @default(now()) @map("voted_at")
  
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  dilemma    Dilemma  @relation(fields: [dilemmaId], references: [id], onDelete: Cascade)
  
  @@unique([userId, dilemmaId]) // Un utilisateur vote une seule fois par dilemme
  @@index([dilemmaId])
  @@index([userId])
  @@map("votes")
}

enum Choice {
  A
  B
}

// ============================================
// SPONSORS
// ============================================

model Sponsor {
  id          String   @id @default(uuid())
  name        String
  logoUrl     String   @map("logo_url")
  brandColor  String   @map("brand_color") // Hex color
  active      Boolean  @default(true)
  
  // Contact
  email       String?
  contactName String?  @map("contact_name")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  // Relations
  dilemmas    Dilemma[]
  rewards     SponsorReward[]
  
  @@map("sponsors")
}

// ============================================
// RÉCOMPENSES SPONSORS
// ============================================

model SponsorReward {
  id             String      @id @default(uuid())
  dilemmaId      String      @map("dilemma_id")
  sponsorId      String      @map("sponsor_id")
  
  // Configuration de la récompense
  choiceTarget   ChoiceTarget @map("choice_target") // Pour quel choix
  rewardType     RewardType   @map("reward_type")   // Type de récompense
  rewardContent  String       @map("reward_content") // Code promo, URL, etc.
  message        String       // Message à afficher
  
  // Validité
  expiresAt      DateTime?    @map("expires_at")
  
  createdAt      DateTime    @default(now()) @map("created_at")
  
  dilemma        Dilemma     @relation(fields: [dilemmaId], references: [id], onDelete: Cascade)
  sponsor        Sponsor     @relation(fields: [sponsorId], references: [id], onDelete: Cascade)
  interactions   RewardInteraction[]
  
  @@index([dilemmaId])
  @@map("sponsor_rewards")
}

enum ChoiceTarget {
  A           // Uniquement pour ceux qui ont choisi A
  B           // Uniquement pour ceux qui ont choisi B
  BOTH        // Pour tous les votants
}

enum RewardType {
  CODE        // Code promo
  LINK        // Lien externe
  IMAGE       // Image (ex: coupon)
  MESSAGE     // Simple message
}

// ============================================
// INTERACTIONS RÉCOMPENSES (Analytics)
// ============================================

model RewardInteraction {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  rewardId   String   @map("reward_id")
  action     InteractionAction
  timestamp  DateTime @default(now())
  
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reward     SponsorReward @relation(fields: [rewardId], references: [id], onDelete: Cascade)
  
  @@index([rewardId])
  @@index([userId])
  @@map("reward_interactions")
}

enum InteractionAction {
  VIEW        // A vu la récompense
  COPY        // A copié le code
  CLICK       // A cliqué sur le lien
}
```

---

## 🚀 Backend API

### Structure des dossiers

```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts          # Configuration Prisma
│   │   ├── redis.ts             # Configuration Redis
│   │   └── env.ts               # Variables d'environnement
│   │
│   ├── middleware/
│   │   ├── auth.ts              # Vérification JWT
│   │   ├── premium.ts           # Vérification premium
│   │   └── errorHandler.ts     # Gestion erreurs
│   │
│   ├── routes/
│   │   ├── auth.routes.ts       # Inscription/Connexion
│   │   ├── dilemmas.routes.ts   # Dilemmes
│   │   ├── votes.routes.ts      # Votes
│   │   ├── friends.routes.ts    # Système d'amis
│   │   ├── stats.routes.ts      # Statistiques
│   │   ├── admin.routes.ts      # Admin (CRUD dilemmes)
│   │   └── sponsors.routes.ts   # Gestion sponsors
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── dilemmas.controller.ts
│   │   ├── votes.controller.ts
│   │   ├── stats.controller.ts
│   │   └── admin.controller.ts
│   │
│   ├── services/
│   │   ├── dilemma.service.ts   # Logique métier dilemmes
│   │   ├── vote.service.ts      # Logique métier votes
│   │   ├── stats.service.ts     # Calcul statistiques
│   │   ├── reward.service.ts    # Gestion récompenses
│   │   └── scheduler.service.ts # Planification (Bull)
│   │
│   ├── utils/
│   │   ├── jwt.ts
│   │   ├── password.ts
│   │   └── validators.ts
│   │
│   └── index.ts                 # Point d'entrée
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### Endpoints API principaux

```typescript
// src/routes/dilemmas.routes.ts

import { Router } from 'express';
import { auth, premium } from '../middleware';
import * as dilemmaController from '../controllers/dilemmas.controller';

const router = Router();

// Dilemme du jour (public pour tous)
router.get('/today', auth, dilemmaController.getToday);

// Dilemme de demain (premium only)
router.get('/tomorrow', auth, premium, dilemmaController.getTomorrow);

// Historique (7 jours pour free, illimité pour premium)
router.get('/history', auth, dilemmaController.getHistory);

// Détails d'un dilemme spécifique
router.get('/:id', auth, dilemmaController.getById);

export default router;
```

```typescript
// src/routes/votes.routes.ts

import { Router } from 'express';
import { auth } from '../middleware';
import * as voteController from '../controllers/votes.controller';

const router = Router();

// Voter sur un dilemme
router.post('/', auth, voteController.create);

// Récupérer la récompense après vote
router.get('/:dilemmaId/reward', auth, voteController.getReward);

// Vérifier si l'utilisateur a déjà voté
router.get('/:dilemmaId/status', auth, voteController.getVoteStatus);

export default router;
```

```typescript
// src/routes/stats.routes.ts

import { Router } from 'express';
import { auth } from '../middleware';
import * as statsController from '../controllers/stats.controller';

const router = Router();

// Statistiques globales d'un dilemme
router.get('/dilemmas/:id/global', auth, statsController.getGlobalStats);

// Statistiques par démographie (nécessite d'avoir rempli sa démo)
router.get('/dilemmas/:id/demographic', auth, statsController.getDemographicStats);

// Statistiques entre amis
router.get('/dilemmas/:id/friends', auth, statsController.getFriendsStats);

// Statistiques d'un ami spécifique (premium only)
router.get('/dilemmas/:id/friends/:friendId', auth, statsController.getSpecificFriendStats);

export default router;
```

```typescript
// src/routes/admin.routes.ts

import { Router } from 'express';
import { auth, adminOnly } from '../middleware';
import * as adminController from '../controllers/admin.controller';

const router = Router();

// CRUD Dilemmes
router.post('/dilemmas', auth, adminOnly, adminController.createDilemma);
router.put('/dilemmas/:id', auth, adminOnly, adminController.updateDilemma);
router.delete('/dilemmas/:id', auth, adminOnly, adminController.deleteDilemma);
router.get('/dilemmas', auth, adminOnly, adminController.listDilemmas);

// CRUD Sponsors
router.post('/sponsors', auth, adminOnly, adminController.createSponsor);
router.put('/sponsors/:id', auth, adminOnly, adminController.updateSponsor);
router.get('/sponsors', auth, adminOnly, adminController.listSponsors);

// Analytics pour sponsors
router.get('/sponsors/:id/analytics', auth, adminOnly, adminController.getSponsorAnalytics);

export default router;
```

### Services clés

```typescript
// src/services/dilemma.service.ts

import { PrismaClient } from '@prisma/client';
import { startOfDay, endOfDay, subDays, addDays } from 'date-fns';

const prisma = new PrismaClient();

export class DilemmaService {
  // Récupérer le dilemme du jour
  async getTodayDilemma() {
    const today = new Date();
    const dilemma = await prisma.dilemma.findFirst({
      where: {
        publishDate: {
          gte: startOfDay(today),
          lte: endOfDay(today),
        },
      },
      include: {
        sponsor: true,
      },
    });
    
    return dilemma;
  }

  // Récupérer le dilemme de demain (premium)
  async getTomorrowDilemma() {
    const tomorrow = addDays(new Date(), 1);
    const dilemma = await prisma.dilemma.findFirst({
      where: {
        publishDate: {
          gte: startOfDay(tomorrow),
          lte: endOfDay(tomorrow),
        },
      },
      include: {
        sponsor: true,
      },
    });
    
    return dilemma;
  }

  // Historique
  async getHistory(userId: string, isPremium: boolean, days?: number) {
    const limitDays = isPremium ? (days || 365) : Math.min(days || 7, 7);
    const startDate = subDays(new Date(), limitDays);
    
    const dilemmas = await prisma.dilemma.findMany({
      where: {
        publishDate: {
          gte: startDate,
          lt: new Date(),
        },
      },
      include: {
        sponsor: true,
        votes: {
          where: { userId },
        },
      },
      orderBy: {
        publishDate: 'desc',
      },
    });
    
    return dilemmas;
  }
}
```

```typescript
// src/services/stats.service.ts

import { PrismaClient, Gender } from '@prisma/client';
import { redis } from '../config/redis';

const prisma = new PrismaClient();

export class StatsService {
  // Statistiques globales (avec cache Redis)
  async getGlobalStats(dilemmaId: string) {
    // Vérifier le cache
    const cached = await redis.get(`stats:global:${dilemmaId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculer les stats
    const totalVotes = await prisma.vote.count({
      where: { dilemmaId },
    });

    const votesA = await prisma.vote.count({
      where: { dilemmaId, choice: 'A' },
    });

    const votesB = totalVotes - votesA;

    const stats = {
      totalVotes,
      choiceA: {
        count: votesA,
        percentage: totalVotes > 0 ? (votesA / totalVotes) * 100 : 0,
      },
      choiceB: {
        count: votesB,
        percentage: totalVotes > 0 ? (votesB / totalVotes) * 100 : 0,
      },
    };

    // Mettre en cache (1 minute)
    await redis.setex(`stats:global:${dilemmaId}`, 60, JSON.stringify(stats));

    return stats;
  }

  // Statistiques par genre
  async getStatsByGender(dilemmaId: string, userGender?: Gender) {
    if (!userGender) {
      throw new Error('Vous devez renseigner votre genre pour voir ces statistiques');
    }

    const stats = await prisma.vote.groupBy({
      by: ['choice'],
      where: {
        dilemmaId,
        user: {
          gender: { not: null },
        },
      },
      _count: true,
    });

    // Grouper par genre
    const genderStats = await prisma.vote.groupBy({
      by: ['choice'],
      where: {
        dilemmaId,
        user: { gender: userGender },
      },
      _count: true,
    });

    return {
      global: stats,
      yourGender: genderStats,
    };
  }

  // Statistiques entre amis
  async getFriendsStats(dilemmaId: string, userId: string) {
    // Récupérer les amis acceptés
    const friends = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: 'ACCEPTED' },
          { friendId: userId, status: 'ACCEPTED' },
        ],
      },
    });

    const friendIds = friends.map(f => 
      f.userId === userId ? f.friendId : f.userId
    );

    // Votes des amis
    const friendsVotes = await prisma.vote.groupBy({
      by: ['choice'],
      where: {
        dilemmaId,
        userId: { in: friendIds },
      },
      _count: true,
    });

    const totalFriends = friendIds.length;
    const votedFriends = friendsVotes.reduce((sum, v) => sum + v._count, 0);

    return {
      totalFriends,
      votedFriends,
      notVoted: totalFriends - votedFriends,
      breakdown: friendsVotes,
    };
  }
}
```

```typescript
// src/services/scheduler.service.ts

import Bull from 'bull';
import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';

const prisma = new PrismaClient();

// File d'attente pour la publication des dilemmes
const dilemmaQueue = new Bull('dilemma-publishing', {
  redis: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  },
});

export class SchedulerService {
  // Planifier la publication d'un dilemme
  async scheduleDilemma(dilemmaId: string, publishDate: Date) {
    await dilemmaQueue.add(
      'publish-dilemma',
      { dilemmaId },
      { 
        delay: publishDate.getTime() - Date.now(),
        jobId: `publish-${dilemmaId}`,
      }
    );
  }

  // Planifier la révélation des résultats (20h)
  async scheduleReveal(dilemmaId: string, revealTime: Date) {
    await dilemmaQueue.add(
      'reveal-results',
      { dilemmaId },
      { 
        delay: revealTime.getTime() - Date.now(),
        jobId: `reveal-${dilemmaId}`,
      }
    );
  }

  // Initialiser les workers
  initWorkers() {
    dilemmaQueue.process('publish-dilemma', async (job) => {
      const { dilemmaId } = job.data;
      console.log(`📢 Publication du dilemme ${dilemmaId}`);
      
      // Envoyer notification push aux utilisateurs
      // await notificationService.sendPush(...)
      
      // Invalider les caches
      await redis.del('dilemma:today');
    });

    dilemmaQueue.process('reveal-results', async (job) => {
      const { dilemmaId } = job.data;
      console.log(`🎉 Révélation des résultats ${dilemmaId}`);
      
      // Invalider les caches de stats
      await redis.del(`stats:global:${dilemmaId}`);
      
      // Envoyer notification avec résultats
      // await notificationService.sendResults(dilemmaId);
    });
  }
}
```

### Configuration

```typescript
// src/config/env.ts

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '7d',
  },
  
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
};
```

```env
# .env.example

NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dilemma_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-key-change-this-in-production

# AWS (pour stockage logos sponsors)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=dilemma-sponsors

# RevenueCat (abonnements)
REVENUECAT_API_KEY=

# Firebase (notifications)
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
```

---

## 🎨 Admin Panel (React)

### Structure

```
admin-panel/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── Dilemmas/
│   │   │   ├── DilemmaForm.tsx
│   │   │   ├── DilemmaList.tsx
│   │   │   └── DilemmaPreview.tsx
│   │   ├── Sponsors/
│   │   │   ├── SponsorForm.tsx
│   │   │   ├── SponsorList.tsx
│   │   │   └── SponsorAnalytics.tsx
│   │   └── Common/
│   │       ├── DatePicker.tsx
│   │       └── ColorPicker.tsx
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Dilemmas.tsx
│   │   ├── Sponsors.tsx
│   │   ├── Analytics.tsx
│   │   └── Login.tsx
│   │
│   ├── services/
│   │   ├── api.ts
│   │   └── auth.ts
│   │
│   ├── hooks/
│   │   ├── useDilemmas.ts
│   │   ├── useSponsors.ts
│   │   └── useAuth.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── package.json
└── vite.config.ts
```

### Exemple de composant

```typescript
// src/components/Dilemmas/DilemmaForm.tsx

import React, { useState } from 'react';
import { Form, Input, Select, DatePicker, Button, Switch } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createDilemma } from '../../services/api';

export const DilemmaForm: React.FC = () => {
  const [isSponsored, setIsSponsored] = useState(false);

  const { data: sponsors } = useQuery(['sponsors'], fetchSponsors);

  const mutation = useMutation(createDilemma, {
    onSuccess: () => {
      message.success('Dilemme créé avec succès !');
    },
  });

  const onFinish = (values: any) => {
    mutation.mutate(values);
  };

  return (
    <Form layout="vertical" onFinish={onFinish}>
      <Form.Item 
        label="Question" 
        name="question" 
        rules={[{ required: true }]}
      >
        <Input.TextArea rows={3} />
      </Form.Item>

      <Form.Item 
        label="Option A" 
        name="optionA" 
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>

      <Form.Item 
        label="Option B" 
        name="optionB" 
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>

      <Form.Item 
        label="Date de publication" 
        name="publishDate"
        rules={[{ required: true }]}
      >
        <DatePicker showTime />
      </Form.Item>

      <Form.Item label="Sponsorisé ?" name="isSponsored">
        <Switch onChange={setIsSponsored} />
      </Form.Item>

      {isSponsored && (
        <>
          <Form.Item label="Sponsor" name="sponsorId">
            <Select>
              {sponsors?.map(s => (
                <Select.Option key={s.id} value={s.id}>
                  {s.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Récompense Option A">
            <Input placeholder="Code promo ou lien" />
          </Form.Item>

          <Form.Item label="Récompense Option B">
            <Input placeholder="Code promo ou lien" />
          </Form.Item>
        </>
      )}

      <Button type="primary" htmlType="submit" loading={mutation.isLoading}>
        Créer le dilemme
      </Button>
    </Form>
  );
};
```

---

## 📱 Application Mobile (Flutter)

### Structure

```
mobile_app/
├── lib/
│   ├── main.dart
│   ├── app.dart
│   │
│   ├── core/
│   │   ├── config/
│   │   │   └── app_config.dart
│   │   ├── routes/
│   │   │   └── app_router.dart
│   │   └── theme/
│   │       └── app_theme.dart
│   │
│   ├── data/
│   │   ├── models/
│   │   │   ├── user.dart
│   │   │   ├── dilemma.dart
│   │   │   ├── vote.dart
│   │   │   └── sponsor.dart
│   │   ├── repositories/
│   │   │   ├── auth_repository.dart
│   │   │   ├── dilemma_repository.dart
│   │   │   └── stats_repository.dart
│   │   └── services/
│   │       ├── api_service.dart
│   │       └── local_storage.dart
│   │
│   ├── presentation/
│   │   ├── providers/
│   │   │   ├── auth_provider.dart
│   │   │   ├── dilemma_provider.dart
│   │   │   └── stats_provider.dart
│   │   ├── screens/
│   │   │   ├── auth/
│   │   │   │   ├── login_screen.dart
│   │   │   │   └── register_screen.dart
│   │   │   ├── home/
│   │   │   │   └── home_screen.dart
│   │   │   ├── dilemma/
│   │   │   │   ├── dilemma_screen.dart
│   │   │   │   └── results_screen.dart
│   │   │   ├── history/
│   │   │   │   └── history_screen.dart
│   │   │   ├── friends/
│   │   │   │   └── friends_screen.dart
│   │   │   └── profile/
│   │   │       └── profile_screen.dart
│   │   └── widgets/
│   │       ├── dilemma_card.dart
│   │       ├── sponsor_banner.dart
│   │       ├── stats_chart.dart
│   │       └── reward_modal.dart
│   │
│   └── utils/
│       ├── constants.dart
│       └── helpers.dart
│
├── pubspec.yaml
└── README.md
```

### Exemple de modèle

```dart
// lib/data/models/dilemma.dart

class Dilemma {
  final String id;
  final String question;
  final String optionA;
  final String optionB;
  final DateTime publishDate;
  final DateTime revealTime;
  final bool isSponsored;
  final Sponsor? sponsor;
  final Vote? userVote;

  Dilemma({
    required this.id,
    required this.question,
    required this.optionA,
    required this.optionB,
    required this.publishDate,
    required this.revealTime,
    this.isSponsored = false,
    this.sponsor,
    this.userVote,
  });

  factory Dilemma.fromJson(Map<String, dynamic> json) {
    return Dilemma(
      id: json['id'],
      question: json['question'],
      optionA: json['optionA'],
      optionB: json['optionB'],
      publishDate: DateTime.parse(json['publishDate']),
      revealTime: DateTime.parse(json['revealTime']),
      isSponsored: json['isSponsored'] ?? false,
      sponsor: json['sponsor'] != null 
        ? Sponsor.fromJson(json['sponsor']) 
        : null,
      userVote: json['userVote'] != null 
        ? Vote.fromJson(json['userVote']) 
        : null,
    );
  }

  bool get hasRevealPassed => DateTime.now().isAfter(revealTime);
  bool get hasUserVoted => userVote != null;
}
```

### Exemple de screen

```dart
// lib/presentation/screens/dilemma/dilemma_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class DilemmaScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dilemmaAsync = ref.watch(todayDilemmaProvider);

    return Scaffold(
      body: dilemmaAsync.when(
        data: (dilemma) => _buildDilemmaContent(dilemma, ref),
        loading: () => Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Erreur: $err')),
      ),
    );
  }

  Widget _buildDilemmaContent(Dilemma dilemma, WidgetRef ref) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            // Sponsor banner si sponsorisé
            if (dilemma.isSponsored && dilemma.sponsor != null)
              SponsorBanner(sponsor: dilemma.sponsor!),
            
            SizedBox(height: 24),
            
            // Question
            Text(
              dilemma.question,
              style: Theme.of(context).textTheme.headlineMedium,
              textAlign: TextAlign.center,
            ),
            
            SizedBox(height: 48),
            
            // Options de vote
            if (!dilemma.hasUserVoted) ...[
              _buildVoteButton('A', dilemma.optionA, () {
                ref.read(voteProvider.notifier).vote(dilemma.id, 'A');
              }),
              SizedBox(height: 16),
              _buildVoteButton('B', dilemma.optionB, () {
                ref.read(voteProvider.notifier).vote(dilemma.id, 'B');
              }),
            ] else ...[
              // Afficher les résultats
              if (dilemma.hasRevealPassed)
                StatsChart(dilemmaId: dilemma.id)
              else
                Text('Résultats disponibles à 20h 🕐'),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildVoteButton(String choice, String text, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.blue,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          text,
          style: TextStyle(color: Colors.white, fontSize: 18),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
```

---

## ⏰ Système de planification

### Configuration Bull Queue

```typescript
// src/jobs/dilemmaPublisher.ts

import Bull from 'bull';
import { PrismaClient } from '@prisma/client';
import { setHours, setMinutes, addDays } from 'date-fns';

const prisma = new PrismaClient();

export const initDilemmaScheduler = () => {
  const queue = new Bull('dilemma-scheduler', {
    redis: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
  });

  // Planifier tous les dilemmes futurs au démarrage
  queue.process('schedule-future-dilemmas', async () => {
    const futureDilemmas = await prisma.dilemma.findMany({
      where: {
        publishDate: { gt: new Date() },
      },
    });

    for (const dilemma of futureDilemmas) {
      // Publication
      await queue.add(
        'publish',
        { dilemmaId: dilemma.id },
        {
          delay: dilemma.publishDate.getTime() - Date.now(),
          jobId: `publish-${dilemma.id}`,
        }
      );

      // Révélation à 20h
      const revealTime = setMinutes(setHours(dilemma.publishDate, 20), 0);
      await queue.add(
        'reveal',
        { dilemmaId: dilemma.id },
        {
          delay: revealTime.getTime() - Date.now(),
          jobId: `reveal-${dilemma.id}`,
        }
      );
    }
  });

  // Worker: Publication
  queue.process('publish', async (job) => {
    const { dilemmaId } = job.data;
    console.log(`📢 Publication du dilemme ${dilemmaId}`);
    
    // Envoyer notification push
    // Invalider cache
  });

  // Worker: Révélation
  queue.process('reveal', async (job) => {
    const { dilemmaId } = job.data;
    console.log(`🎉 Révélation du dilemme ${dilemmaId}`);
    
    // Calculer et cacher les statistiques
    // Envoyer notification avec résultats
  });

  // Cron job quotidien pour vérifier
  queue.add(
    'schedule-future-dilemmas',
    {},
    {
      repeat: { cron: '0 0 * * *' }, // Chaque jour à minuit
    }
  );

  return queue;
};
```

---

## 🚀 Déploiement

### Docker Compose

```yaml
# docker-compose.yml

version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: dilemma
      POSTGRES_PASSWORD: secure_password
      POSTGRES_DB: dilemma_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://dilemma:secure_password@postgres:5432/dilemma_db
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    command: npm run start:prod

  admin:
    build: ./admin-panel
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:3000
    command: npm run dev

volumes:
  postgres_data:
  redis_data:
```

### Scripts de démarrage

```json
// backend/package.json

{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "seed": "tsx prisma/seed.ts"
  }
}
```

### Commandes de déploiement

```bash
# Développement local
docker-compose up -d
cd backend && npm run prisma:migrate && npm run dev
cd admin-panel && npm run dev

# Production
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 📊 Récapitulatif

### Technologies finales
- **Backend**: Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + Bull
- **Admin**: React + TypeScript + Ant Design + React Query
- **Mobile**: Flutter + Riverpod + Dio
- **Infra**: Docker + AWS/GCP + PM2 + Nginx

### Prochaines étapes
1. ✅ Initialiser les projets (backend, admin, mobile)
2. ✅ Configurer Prisma et créer la DB
3. ✅ Implémenter les endpoints API essentiels
4. ✅ Créer l'interface admin de base
5. ✅ Développer l'app Flutter
6. ✅ Intégrer RevenueCat pour les abonnements
7. ✅ Mettre en place les notifications push
8. ✅ Tests et déploiement

---

**Cette architecture est prête pour un MVP et scale facilement !** 🚀
