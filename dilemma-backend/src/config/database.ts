import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { config } from './env';

// ============================================
// PRISMA CLIENT
// ============================================

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });

if (config.isDevelopment) globalForPrisma.prisma = prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// ============================================
// REDIS CLIENT
// ============================================

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('✅ Redis connecté');
});

redis.on('error', (err) => {
  console.error('❌ Erreur Redis:', err);
});

// ============================================
// CACHE HELPERS
// ============================================

export class CacheService {
  /**
   * Récupère une valeur du cache
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as T;
    } catch (error) {
      console.error(`Erreur lors de la récupération du cache ${key}:`, error);
      return null;
    }
  }

  /**
   * Stocke une valeur dans le cache
   */
  static async set(key: string, value: any, expirationSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (expirationSeconds) {
        await redis.setex(key, expirationSeconds, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch (error) {
      console.error(`Erreur lors de la mise en cache ${key}:`, error);
    }
  }

  /**
   * Supprime une ou plusieurs clés du cache
   */
  static async del(...keys: string[]): Promise<void> {
    try {
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du cache:', error);
    }
  }

  /**
   * Supprime toutes les clés correspondant à un pattern
   */
  static async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error(`Erreur lors de la suppression du pattern ${pattern}:`, error);
    }
  }

  /**
   * Vérifie si une clé existe
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Erreur lors de la vérification de ${key}:`, error);
      return false;
    }
  }
}

// ============================================
// CACHE KEYS CONSTANTS
// ============================================

export const CACHE_KEYS = {
  DILEMMA_TODAY: 'dilemma:today',
  DILEMMA_TOMORROW: 'dilemma:tomorrow',
  DILEMMA_BY_ID: (id: string) => `dilemma:${id}`,
  STATS_GLOBAL: (dilemmaId: string) => `stats:global:${dilemmaId}`,
  STATS_DEMOGRAPHIC: (dilemmaId: string, filter: string) => `stats:demo:${dilemmaId}:${filter}`,
  STATS_FRIENDS: (dilemmaId: string, userId: string) => `stats:friends:${dilemmaId}:${userId}`,
  USER_PROFILE: (userId: string) => `user:${userId}`,
} as const;

// ============================================
// CACHE TTL CONSTANTS (en secondes)
// ============================================

export const CACHE_TTL = {
  DILEMMA: 3600, // 1 heure
  STATS: 60, // 1 minute (mis à jour fréquemment)
  USER: 1800, // 30 minutes
} as const;