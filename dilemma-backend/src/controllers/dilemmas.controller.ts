// ============================================
// src/controllers/dilemmas.controller.ts
// ============================================

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DilemmaService } from '../services/dilemma.service';
import { prisma } from '../config/database';

export const getToday = asyncHandler(async (req: Request, res: Response) => {
  const dilemma = await DilemmaService.getTodayDilemma();
  
  const userVote = await prisma.vote.findUnique({
    where: {
      userId_dilemmaId: {
        userId: req.user!.id,
        dilemmaId: dilemma.id,
      },
    },
  });

  res.json({
    dilemma,
    hasVoted: !!userVote,
    userChoice: userVote?.choice || null,
    resultsRevealed: DilemmaService.isRevealed(dilemma),
  });
});

export const getTomorrow = asyncHandler(async (req: Request, res: Response) => {
  const dilemma = await DilemmaService.getTomorrowDilemma();
  
  res.json({
    dilemma,
    message: 'Dilemme de demain (accès premium)',
  });
});

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query;
  const daysNumber = days ? parseInt(days as string, 10) : undefined;

  const dilemmas = await DilemmaService.getHistory(
    req.user!.id,
    req.user!.isPremium,
    daysNumber
  );

  res.json({
    dilemmas,
    count: dilemmas.length,
    isPremium: req.user!.isPremium,
    maxDays: req.user!.isPremium ? 'Illimité' : '7',
  });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const dilemma = await DilemmaService.getById(id, req.user!.id);
  res.json({ dilemma });
});

// ============================================
// src/controllers/votes.controller.ts
// ============================================

import { Choice } from '@prisma/client';
import { VoteService } from '../services/vote.service';
import { AppError } from '../middleware/errorHandler';

export const vote = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId, choice } = req.body;

  if (!['A', 'B'].includes(choice)) {
    throw new AppError(400, 'Le choix doit être A ou B');
  }

  const newVote = await VoteService.vote(
    req.user!.id,
    dilemmaId,
    choice as Choice
  );

  res.status(201).json({
    message: 'Vote enregistré avec succès',
    vote: newVote,
  });
});

export const getVoteStatus = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;
  const vote = await VoteService.getUserVote(req.user!.id, dilemmaId);

  res.json({
    hasVoted: !!vote,
    choice: vote?.choice || null,
    votedAt: vote?.votedAt || null,
  });
});

export const getReward = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;
  const reward = await VoteService.getReward(req.user!.id, dilemmaId);

  if (!reward) {
    return res.json({
      hasReward: false,
      message: 'Pas de récompense pour ce dilemme',
    });
  }

  res.json({
    hasReward: true,
    sponsor: reward.sponsor,
    reward: reward.reward,
  });
});

export const trackRewardInteraction = asyncHandler(async (req: Request, res: Response) => {
  const { rewardId, action } = req.body;

  if (!['VIEW', 'COPY', 'CLICK'].includes(action)) {
    throw new AppError(400, 'Action invalide');
  }

  await VoteService.trackRewardInteraction(req.user!.id, rewardId, action);

  res.json({
    message: 'Interaction enregistrée',
  });
});

// ============================================
// src/controllers/stats.controller.ts
// ============================================

import { StatsService } from '../services/stats.service';

export const getGlobalStats = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  const dilemma = await prisma.dilemma.findUnique({
    where: { id: dilemmaId },
  });

  if (!dilemma) {
    throw new AppError(404, 'Dilemme non trouvé');
  }

  if (!DilemmaService.isRevealed(dilemma)) {
    throw new AppError(403, 'Les résultats ne sont pas encore révélés');
  }

  const stats = await StatsService.getGlobalStats(dilemmaId);
  res.json({ stats });
});

export const getStatsByGender = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { gender: true },
  });

  const stats = await StatsService.getStatsByGender(dilemmaId, user?.gender || undefined);
  res.json({ stats });
});

export const getStatsByAge = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;
  const stats = await StatsService.getStatsByAge(dilemmaId, req.user!.id);
  res.json({ stats });
});

export const getFriendsStats = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;
  const stats = await StatsService.getFriendsStats(dilemmaId, req.user!.id);
  res.json({ stats });
});

export const getSpecificFriendStats = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId, friendId } = req.params;
  const stats = await StatsService.getSpecificFriendStats(
    dilemmaId,
    req.user!.id,
    friendId
  );
  res.json({ stats });
});

// ============================================
// src/controllers/admin.controller.ts
// ============================================

import { setHours, setMinutes } from 'date-fns';
import { SchedulerService } from '../services/scheduler.service';

const scheduler = new SchedulerService();

export const createDilemma = asyncHandler(async (req: Request, res: Response) => {
  const { question, optionA, optionB, publishDate, isSponsored, sponsorId } = req.body;

  const publishDateTime = new Date(publishDate);
  const revealTime = setMinutes(setHours(publishDateTime, 20), 0);

  const dilemma = await prisma.dilemma.create({
    data: {
      question,
      optionA,
      optionB,
      publishDate: publishDateTime,
      revealTime,
      isSponsored: isSponsored || false,
      sponsorId: sponsorId || null,
    },
  });

  await scheduler.scheduleDilemma(dilemma.id, publishDateTime, revealTime);

  res.status(201).json({
    message: 'Dilemme créé et planifié',
    dilemma,
  });
});

export const listDilemmas = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);

  const [dilemmas, total] = await Promise.all([
    prisma.dilemma.findMany({
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: { publishDate: 'desc' },
      include: {
        sponsor: true,
        _count: {
          select: { votes: true },
        },
      },
    }),
    prisma.dilemma.count(),
  ]);

  res.json({
    dilemmas,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

export const updateDilemma = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { question, optionA, optionB, publishDate } = req.body;

  const dilemma = await prisma.dilemma.update({
    where: { id },
    data: {
      ...(question && { question }),
      ...(optionA && { optionA }),
      ...(optionB && { optionB }),
      ...(publishDate && { 
        publishDate: new Date(publishDate),
        revealTime: setMinutes(setHours(new Date(publishDate), 20), 0),
      }),
    },
  });

  if (publishDate) {
    await scheduler.rescheduleDilemma(dilemma.id, dilemma.publishDate, dilemma.revealTime);
  }

  res.json({
    message: 'Dilemme mis à jour',
    dilemma,
  });
});

export const deleteDilemma = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await scheduler.unscheduleDilemma(id);
  await prisma.dilemma.delete({ where: { id } });
  res.json({ message: 'Dilemme supprimé' });
});