// ============================================
// src/services/dilemma.service.ts
// ============================================

import { prisma, CacheService, CACHE_KEYS, CACHE_TTL } from '../config/database';
import { startOfDay, endOfDay, subDays, addDays } from 'date-fns';
import { AppError } from '../middleware/errorHandler';

export class DilemmaService {
  /**
   * Récupérer le dilemme du jour
   */
  static async getTodayDilemma() {
    // Vérifier le cache
    const cached = await CacheService.get(CACHE_KEYS.DILEMMA_TODAY);
    if (cached) return cached;

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

    if (!dilemma) {
      throw new AppError(404, 'Aucun dilemme disponible pour aujourd\'hui');
    }

    // Mettre en cache
    await CacheService.set(CACHE_KEYS.DILEMMA_TODAY, dilemma, CACHE_TTL.DILEMMA);

    return dilemma;
  }

  /**
   * Récupérer le dilemme de demain (premium uniquement)
   */
  static async getTomorrowDilemma() {
    // Vérifier le cache
    const cached = await CacheService.get(CACHE_KEYS.DILEMMA_TOMORROW);
    if (cached) return cached;

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

    if (!dilemma) {
      throw new AppError(404, 'Aucun dilemme prévu pour demain');
    }

    // Mettre en cache
    await CacheService.set(CACHE_KEYS.DILEMMA_TOMORROW, dilemma, CACHE_TTL.DILEMMA);

    return dilemma;
  }

  /**
   * Récupérer l'historique des dilemmes
   */
  static async getHistory(userId: string, isPremium: boolean, days?: number) {
    // Limiter l'historique selon le statut premium
    const limitDays = isPremium ? (days || 365) : Math.min(days || 7, 7);
    const startDate = subDays(new Date(), limitDays);

    const dilemmas = await prisma.dilemma.findMany({
      where: {
        publishDate: {
          gte: startDate,
          lt: startOfDay(new Date()),
        },
      },
      include: {
        sponsor: true,
        votes: {
          where: { userId },
          select: {
            choice: true,
            votedAt: true,
          },
        },
      },
      orderBy: {
        publishDate: 'desc',
      },
    });

    return dilemmas;
  }

  /**
   * Récupérer un dilemme par ID
   */
  static async getById(dilemmaId: string, userId?: string) {
    const dilemma = await prisma.dilemma.findUnique({
      where: { id: dilemmaId },
      include: {
        sponsor: true,
        votes: userId ? {
          where: { userId },
        } : false,
      },
    });

    if (!dilemma) {
      throw new AppError(404, 'Dilemme non trouvé');
    }

    return dilemma;
  }

  /**
   * Vérifier si les résultats sont révélés (après 20h)
   */
  static isRevealed(dilemma: { revealTime: Date }): boolean {
    return new Date() >= dilemma.revealTime;
  }
}

// ============================================
// src/services/vote.service.ts
// ============================================

import { Choice } from '@prisma/client';

export class VoteService {
  /**
   * Voter pour un dilemme
   */
  static async vote(userId: string, dilemmaId: string, choice: Choice) {
    // Vérifier que le dilemme existe
    const dilemma = await prisma.dilemma.findUnique({
      where: { id: dilemmaId },
    });

    if (!dilemma) {
      throw new AppError(404, 'Dilemme non trouvé');
    }

    // Vérifier que l'utilisateur n'a pas déjà voté
    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_dilemmaId: {
          userId,
          dilemmaId,
        },
      },
    });

    if (existingVote) {
      throw new AppError(400, 'Vous avez déjà voté pour ce dilemme');
    }

    // Créer le vote
    const vote = await prisma.vote.create({
      data: {
        userId,
        dilemmaId,
        choice,
      },
    });

    // Invalider les caches de statistiques
    await CacheService.delPattern(`stats:*:${dilemmaId}*`);

    return vote;
  }

  /**
   * Récupérer le vote d'un utilisateur pour un dilemme
   */
  static async getUserVote(userId: string, dilemmaId: string) {
    return await prisma.vote.findUnique({
      where: {
        userId_dilemmaId: {
          userId,
          dilemmaId,
        },
      },
    });
  }

  /**
   * Récupérer la récompense après vote (si dilemme sponsorisé)
   */
  static async getReward(userId: string, dilemmaId: string) {
    // Vérifier que l'utilisateur a voté
    const vote = await this.getUserVote(userId, dilemmaId);
    if (!vote) {
      throw new AppError(400, 'Vous devez d\'abord voter');
    }

    // Récupérer le dilemme avec sponsor
    const dilemma = await prisma.dilemma.findUnique({
      where: { id: dilemmaId },
      include: {
        sponsor: true,
        rewards: {
          where: {
            OR: [
              { choiceTarget: vote.choice },
              { choiceTarget: 'BOTH' },
            ],
          },
        },
      },
    });

    if (!dilemma?.isSponsored || !dilemma.sponsor || dilemma.rewards.length === 0) {
      return null;
    }

    const reward = dilemma.rewards[0];

    // Enregistrer l'interaction (analytics)
    await prisma.rewardInteraction.create({
      data: {
        userId,
        rewardId: reward.id,
        action: 'VIEW',
      },
    });

    return {
      sponsor: dilemma.sponsor,
      reward,
    };
  }

  /**
   * Enregistrer une interaction avec la récompense
   */
  static async trackRewardInteraction(
    userId: string,
    rewardId: string,
    action: 'VIEW' | 'COPY' | 'CLICK'
  ) {
    await prisma.rewardInteraction.create({
      data: {
        userId,
        rewardId,
        action,
      },
    });
  }
}

// ============================================
// src/services/stats.service.ts
// ============================================

import { Gender } from '@prisma/client';

export class StatsService {
  /**
   * Statistiques globales d'un dilemme
   */
  static async getGlobalStats(dilemmaId: string) {
    // Vérifier le cache
    const cacheKey = CACHE_KEYS.STATS_GLOBAL(dilemmaId);
    const cached = await CacheService.get(cacheKey);
    if (cached) return cached;

    // Compter les votes
    const [totalVotes, votesA] = await Promise.all([
      prisma.vote.count({ where: { dilemmaId } }),
      prisma.vote.count({ where: { dilemmaId, choice: 'A' } }),
    ]);

    const votesB = totalVotes - votesA;

    const stats = {
      totalVotes,
      choiceA: {
        count: votesA,
        percentage: totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 0,
      },
      choiceB: {
        count: votesB,
        percentage: totalVotes > 0 ? Math.round((votesB / totalVotes) * 100) : 0,
      },
    };

    // Mettre en cache
    await CacheService.set(cacheKey, stats, CACHE_TTL.STATS);

    return stats;
  }

  /**
   * Statistiques par genre
   */
  static async getStatsByGender(dilemmaId: string, userGender?: Gender) {
    if (!userGender) {
      throw new AppError(403, 'Vous devez renseigner votre genre pour voir ces statistiques');
    }

    // Stats globales (tous genres)
    const allGenders = await prisma.vote.groupBy({
      by: ['choice'],
      where: {
        dilemmaId,
        user: {
          gender: { not: null },
        },
      },
      _count: true,
    });

    // Stats pour le genre de l'utilisateur
    const userGenderStats = await prisma.vote.groupBy({
      by: ['choice'],
      where: {
        dilemmaId,
        user: { gender: userGender },
      },
      _count: true,
    });

    return {
      all: this.formatGroupedStats(allGenders),
      yourGender: this.formatGroupedStats(userGenderStats),
    };
  }

  /**
   * Statistiques par tranche d'âge
   */
  static async getStatsByAge(dilemmaId: string, userId: string) {
    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });

    if (!user?.birthDate) {
      throw new AppError(403, 'Vous devez renseigner votre date de naissance');
    }

    // Calculer l'âge et la tranche
    const age = this.calculateAge(user.birthDate);
    const ageRange = this.getAgeRange(age);

    // Récupérer les votes de la même tranche d'âge
    const votes = await prisma.vote.findMany({
      where: {
        dilemmaId,
        user: {
          birthDate: { not: null },
        },
      },
      include: {
        user: {
          select: { birthDate: true },
        },
      },
    });

    // Filtrer par tranche d'âge
    const sameAgeRange = votes.filter(vote => {
      if (!vote.user.birthDate) return false;
      const voterAge = this.calculateAge(vote.user.birthDate);
      return this.getAgeRange(voterAge) === ageRange;
    });

    const choiceA = sameAgeRange.filter(v => v.choice === 'A').length;
    const choiceB = sameAgeRange.length - choiceA;

    return {
      ageRange,
      totalVotes: sameAgeRange.length,
      choiceA: {
        count: choiceA,
        percentage: sameAgeRange.length > 0 ? Math.round((choiceA / sameAgeRange.length) * 100) : 0,
      },
      choiceB: {
        count: choiceB,
        percentage: sameAgeRange.length > 0 ? Math.round((choiceB / sameAgeRange.length) * 100) : 0,
      },
    };
  }

  /**
   * Statistiques entre amis
   */
  static async getFriendsStats(dilemmaId: string, userId: string) {
    // Récupérer les amis acceptés
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: 'ACCEPTED' },
          { friendId: userId, status: 'ACCEPTED' },
        ],
      },
    });

    const friendIds = friendships.map(f =>
      f.userId === userId ? f.friendId : f.userId
    );

    if (friendIds.length === 0) {
      return {
        totalFriends: 0,
        votedFriends: 0,
        notVoted: 0,
        choiceA: { count: 0, percentage: 0 },
        choiceB: { count: 0, percentage: 0 },
      };
    }

    // Votes des amis
    const friendsVotes = await prisma.vote.findMany({
      where: {
        dilemmaId,
        userId: { in: friendIds },
      },
    });

    const votesA = friendsVotes.filter(v => v.choice === 'A').length;
    const votesB = friendsVotes.length - votesA;

    return {
      totalFriends: friendIds.length,
      votedFriends: friendsVotes.length,
      notVoted: friendIds.length - friendsVotes.length,
      choiceA: {
        count: votesA,
        percentage: friendsVotes.length > 0 ? Math.round((votesA / friendsVotes.length) * 100) : 0,
      },
      choiceB: {
        count: votesB,
        percentage: friendsVotes.length > 0 ? Math.round((votesB / friendsVotes.length) * 100) : 0,
      },
    };
  }

  /**
   * Statistiques d'un ami spécifique (premium)
   */
  static async getSpecificFriendStats(dilemmaId: string, userId: string, friendId: string) {
    // Vérifier l'amitié
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId, status: 'ACCEPTED' },
          { userId: friendId, friendId: userId, status: 'ACCEPTED' },
        ],
      },
    });

    if (!friendship) {
      throw new AppError(403, 'Vous n\'êtes pas ami avec cet utilisateur');
    }

    // Récupérer les votes
    const [userVote, friendVote] = await Promise.all([
      prisma.vote.findUnique({
        where: { userId_dilemmaId: { userId, dilemmaId } },
      }),
      prisma.vote.findUnique({
        where: { userId_dilemmaId: { userId: friendId, dilemmaId } },
      }),
    ]);

    return {
      yourChoice: userVote?.choice || null,
      friendChoice: friendVote?.choice || null,
      match: userVote && friendVote ? userVote.choice === friendVote.choice : null,
    };
  }

  // Helpers
  private static formatGroupedStats(grouped: any[]) {
    const total = grouped.reduce((sum, g) => sum + g._count, 0);
    const choiceA = grouped.find(g => g.choice === 'A')?._count || 0;
    const choiceB = grouped.find(g => g.choice === 'B')?._count || 0;

    return {
      totalVotes: total,
      choiceA: {
        count: choiceA,
        percentage: total > 0 ? Math.round((choiceA / total) * 100) : 0,
      },
      choiceB: {
        count: choiceB,
        percentage: total > 0 ? Math.round((choiceB / total) * 100) : 0,
      },
    };
  }

  private static calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  private static getAgeRange(age: number): string {
    if (age < 18) return '0-17';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 50) return '35-49';
    if (age < 65) return '50-64';
    return '65+';
  }
}