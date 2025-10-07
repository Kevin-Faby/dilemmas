// ============================================
// src/controllers/auth.controller.ts
// ============================================

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { AppError, asyncHandler } from '../middleware/errorHandler';

/**
 * Inscription d'un nouvel utilisateur
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, username } = req.body;

  // Vérifier si l'utilisateur existe déjà
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existing) {
    throw new AppError(409, 'Email ou nom d\'utilisateur déjà utilisé');
  }

  // Hasher le mot de passe
  const passwordHash = await bcrypt.hash(password, 10);

  // Créer l'utilisateur
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
    },
  });

  // Générer le token JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.status(201).json({
    message: 'Inscription réussie',
    user,
    token,
  });
});

/**
 * Connexion
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Récupérer l'utilisateur
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(401, 'Email ou mot de passe incorrect');
  }

  // Vérifier le mot de passe
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError(401, 'Email ou mot de passe incorrect');
  }

  // Mettre à jour la date de dernière connexion
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Générer le token JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  // Vérifier si premium est toujours valide
  const isPremium = user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date());

  res.json({
    message: 'Connexion réussie',
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      isPremium,
      premiumUntil: user.premiumUntil,
    },
    token,
  });
});

/**
 * Récupérer le profil de l'utilisateur connecté
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      username: true,
      birthDate: true,
      gender: true,
      region: true,
      isPremium: true,
      premiumUntil: true,
      createdAt: true,
    },
  });

  res.json({ user });
});

// ============================================
// src/controllers/dilemmas.controller.ts
// ============================================

import { DilemmaService } from '../services/dilemma.service';

/**
 * Récupérer le dilemme du jour
 */
export const getToday = asyncHandler(async (req: Request, res: Response) => {
  const dilemma = await DilemmaService.getTodayDilemma();
  
  // Vérifier si l'utilisateur a déjà voté
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

/**
 * Récupérer le dilemme de demain (premium)
 */
export const getTomorrow = asyncHandler(async (req: Request, res: Response) => {
  const dilemma = await DilemmaService.getTomorrowDilemma();
  
  res.json({
    dilemma,
    message: 'Dilemme de demain (accès premium)',
  });
});

/**
 * Récupérer l'historique
 */
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

/**
 * Récupérer un dilemme par ID
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const dilemma = await DilemmaService.getById(id, req.user!.id);
  
  res.json({ dilemma });
});

// ============================================
// src/controllers/votes.controller.ts
// ============================================

import { VoteService } from '../services/vote.service';
import { Choice } from '@prisma/client';

/**
 * Voter pour un dilemme
 */
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

/**
 * Récupérer le statut de vote pour un dilemme
 */
export const getVoteStatus = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  const vote = await VoteService.getUserVote(req.user!.id, dilemmaId);

  res.json({
    hasVoted: !!vote,
    choice: vote?.choice || null,
    votedAt: vote?.votedAt || null,
  });
});

/**
 * Récupérer la récompense après vote
 */
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

/**
 * Enregistrer une interaction avec la récompense
 */
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

/**
 * Statistiques globales
 */
export const getGlobalStats = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  // Vérifier que le dilemme est révélé
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

/**
 * Statistiques par genre
 */
export const getStatsByGender = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { gender: true },
  });

  const stats = await StatsService.getStatsByGender(dilemmaId, user?.gender || undefined);

  res.json({ stats });
});

/**
 * Statistiques par âge
 */
export const getStatsByAge = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  const stats = await StatsService.getStatsByAge(dilemmaId, req.user!.id);

  res.json({ stats });
});

/**
 * Statistiques entre amis
 */
export const getFriendsStats = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId } = req.params;

  const stats = await StatsService.getFriendsStats(dilemmaId, req.user!.id);

  res.json({ stats });
});

/**
 * Statistiques d'un ami spécifique (premium)
 */
export const getSpecificFriendStats = asyncHandler(async (req: Request, res: Response) => {
  const { dilemmaId, friendId } = req.params;

  const stats = await StatsService.getSpecificFriendStats(
    dilemmaId,
    req.user!.id,
    friendId
  );

  res.json({ stats });
});