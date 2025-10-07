// ============================================
// src/services/vote.service.ts
// ============================================

import { Choice } from '@prisma/client';
import { prisma, CacheService } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class VoteService {
  static async vote(userId: string, dilemmaId: string, choice: Choice) {
    const dilemma = await prisma.dilemma.findUnique({
      where: { id: dilemmaId },
    });

    if (!dilemma) {
      throw new AppError(404, 'Dilemme non trouvé');
    }

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

    const vote = await prisma.vote.create({
      data: {
        userId,
        dilemmaId,
        choice,
      },
    });

    await CacheService.delPattern(`stats:*:${dilemmaId}*`);

    return vote;
  }

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

  static async getReward(userId: string, dilemmaId: string) {
    const vote = await this.getUserVote(userId, dilemmaId);
    if (!vote) {
      throw new AppError(400, 'Vous devez d\'abord voter');
    }

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
import { prisma, CacheService, CACHE_KEYS, CACHE_TTL } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class StatsService {
  static async getGlobalStats(dilemmaId: string) {
    const cacheKey = CACHE_KEYS.STATS_GLOBAL(dilemmaId);
    const cached = await CacheService.get(cacheKey);
    if (cached) return cached;

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

    await CacheService.set(cacheKey, stats, CACHE_TTL.STATS);

    return stats;
  }

  static async getStatsByGender(dilemmaId: string, userGender?: Gender) {
    if (!userGender) {
      throw new AppError(403, 'Vous devez renseigner votre genre pour voir ces statistiques');
    }

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

  static async getStatsByAge(dilemmaId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });

    if (!user?.birthDate) {
      throw new AppError(403, 'Vous devez renseigner votre date de naissance');
    }

    const age = this.calculateAge(user.birthDate);
    const ageRange = this.getAgeRange(age);

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

  static async getFriendsStats(dilemmaId: string, userId: string) {
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

  static async getSpecificFriendStats(dilemmaId: string, userId: string, friendId: string) {
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