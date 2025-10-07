// ============================================
// src/routes/auth.routes.ts
// ============================================

import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validation';
import { auth } from '../middleware/auth';

const router = Router();

// Validation pour l'inscription
const registerValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Le nom d\'utilisateur doit contenir entre 3 et 30 caractères')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores'),
];

// Validation pour la connexion
const loginValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
];

// Routes
router.post('/register', validate(registerValidation), authController.register);
router.post('/login', validate(loginValidation), authController.login);
router.get('/profile', auth, authController.getProfile);

export default router;

// ============================================
// src/routes/dilemmas.routes.ts
// ============================================

import { Router } from 'express';
import { auth, premium } from '../middleware/auth';
import * as dilemmaController from '../controllers/dilemmas.controller';

const router = Router();

router.get('/today', auth, dilemmaController.getToday);
router.get('/tomorrow', auth, premium, dilemmaController.getTomorrow);
router.get('/history', auth, dilemmaController.getHistory);
router.get('/:id', auth, dilemmaController.getById);

export default router;

// ============================================
// src/routes/votes.routes.ts
// ============================================

import { Router } from 'express';
import { body } from 'express-validator';
import { auth } from '../middleware/auth';
import * as voteController from '../controllers/votes.controller';
import { validate } from '../middleware/validation';

const router = Router();

const voteValidation = [
  body('dilemmaId').isUUID().withMessage('ID de dilemme invalide'),
  body('choice').isIn(['A', 'B']).withMessage('Le choix doit être A ou B'),
];

router.post('/', auth, validate(voteValidation), voteController.vote);
router.get('/:dilemmaId/status', auth, voteController.getVoteStatus);
router.get('/:dilemmaId/reward', auth, voteController.getReward);
router.post('/reward/track', auth, voteController.trackRewardInteraction);

export default router;

// ============================================
// src/routes/stats.routes.ts
// ============================================

import { Router } from 'express';
import { auth, premium } from '../middleware/auth';
import * as statsController from '../controllers/stats.controller';

const router = Router();

router.get('/dilemmas/:dilemmaId/global', auth, statsController.getGlobalStats);
router.get('/dilemmas/:dilemmaId/gender', auth, statsController.getStatsByGender);
router.get('/dilemmas/:dilemmaId/age', auth, statsController.getStatsByAge);
router.get('/dilemmas/:dilemmaId/friends', auth, statsController.getFriendsStats);
router.get('/dilemmas/:dilemmaId/friends/:friendId', auth, premium, statsController.getSpecificFriendStats);

export default router;

// ============================================
// src/routes/friends.routes.ts
// ============================================

import { Router } from 'express';
import { auth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';

const router = Router();

// Envoyer une demande d'ami
router.post('/request', auth, asyncHandler(async (req, res) => {
  const { friendUsername } = req.body;

  // Trouver l'ami par username
  const friend = await prisma.user.findUnique({
    where: { username: friendUsername },
  });

  if (!friend) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  if (friend.id === req.user!.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas vous ajouter vous-même' });
  }

  // Vérifier si la demande existe déjà
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: req.user!.id, friendId: friend.id },
        { userId: friend.id, friendId: req.user!.id },
      ],
    },
  });

  if (existing) {
    return res.status(400).json({ error: 'Demande déjà existante' });
  }

  const friendship = await prisma.friendship.create({
    data: {
      userId: req.user!.id,
      friendId: friend.id,
      status: 'PENDING',
    },
  });

  res.status(201).json({
    message: 'Demande d\'ami envoyée',
    friendship,
  });
}));

// Accepter une demande d'ami
router.post('/:friendshipId/accept', auth, asyncHandler(async (req, res) => {
  const { friendshipId } = req.params;

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    return res.status(404).json({ error: 'Demande non trouvée' });
  }

  if (friendship.friendId !== req.user!.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: 'ACCEPTED' },
  });

  res.json({
    message: 'Demande acceptée',
    friendship: updated,
  });
}));

// Refuser/Supprimer une amitié
router.delete('/:friendshipId', auth, asyncHandler(async (req, res) => {
  const { friendshipId } = req.params;

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    return res.status(404).json({ error: 'Amitié non trouvée' });
  }

  if (friendship.userId !== req.user!.id && friendship.friendId !== req.user!.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }

  await prisma.friendship.delete({
    where: { id: friendshipId },
  });

  res.json({ message: 'Amitié supprimée' });
}));

// Liste des amis
router.get('/', auth, asyncHandler(async (req, res) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { userId: req.user!.id },
        { friendId: req.user!.id },
      ],
      status: 'ACCEPTED',
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
      friend: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  const friends = friendships.map(f => {
    const friend = f.userId === req.user!.id ? f.friend : f.user;
    return {
      id: f.id,
      friendId: friend.id,
      username: friend.username,
    };
  });

  res.json({ friends });
}));

// Demandes en attente
router.get('/pending', auth, asyncHandler(async (req, res) => {
  const pending = await prisma.friendship.findMany({
    where: {
      friendId: req.user!.id,
      status: 'PENDING',
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  res.json({ requests: pending });
}));

export default router;

// ============================================
// src/routes/users.routes.ts
// ============================================

import { Router } from 'express';
import { body } from 'express-validator';
import { auth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { prisma } from '../config/database';

const router = Router();

// Mettre à jour le profil
const updateProfileValidation = [
  body('birthDate').optional().isISO8601().withMessage('Date de naissance invalide'),
  body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']),
  body('region').optional().isString(),
];

router.patch('/profile', auth, validate(updateProfileValidation), asyncHandler(async (req, res) => {
  const { birthDate, gender, region } = req.body;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...(birthDate && { birthDate: new Date(birthDate) }),
      ...(gender && { gender }),
      ...(region && { region }),
    },
    select: {
      id: true,
      email: true,
      username: true,
      birthDate: true,
      gender: true,
      region: true,
    },
  });

  res.json({
    message: 'Profil mis à jour',
    user,
  });
}));

export default router;

// ============================================
// src/routes/admin.routes.ts
// ============================================

import { Router } from 'express';
import { body } from 'express-validator';
import { auth, adminOnly } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { SchedulerService } from '../services/scheduler.service';
import { setHours, setMinutes } from 'date-fns';

const router = Router();
const scheduler = new SchedulerService();

// Validation pour créer un dilemme
const createDilemmaValidation = [
  body('question').notEmpty().withMessage('Question requise'),
  body('optionA').notEmpty().withMessage('Option A requise'),
  body('optionB').notEmpty().withMessage('Option B requise'),
  body('publishDate').isISO8601().withMessage('Date de publication invalide'),
  body('isSponsored').optional().isBoolean(),
  body('sponsorId').optional().isUUID(),
];

// Créer un dilemme
router.post('/dilemmas', auth, adminOnly, validate(createDilemmaValidation), asyncHandler(async (req, res) => {
  const { question, optionA, optionB, publishDate, isSponsored, sponsorId } = req.body;

  const publishDateTime = new Date(publishDate);
  const revealTime = setMinutes(setHours(publishDateTime, 20), 0); // 20h00

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

  // Planifier le dilemme
  await scheduler.scheduleDilemma(dilemma.id, publishDateTime, revealTime);

  res.status(201).json({
    message: 'Dilemme créé et planifié',
    dilemma,
  });
}));

// Lister tous les dilemmes (avec pagination)
router.get('/dilemmas', auth, adminOnly, asyncHandler(async (req, res) => {
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
}));

// Mettre à jour un dilemme
router.put('/dilemmas/:id', auth, adminOnly, asyncHandler(async (req, res) => {
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

  // Re-planifier si la date a changé
  if (publishDate) {
    await scheduler.rescheduleDilemma(
      dilemma.id,
      dilemma.publishDate,
      dilemma.revealTime
    );
  }

  res.json({
    message: 'Dilemme mis à jour',
    dilemma,
  });
}));

// Supprimer un dilemme
router.delete('/dilemmas/:id', auth, adminOnly, asyncHandler(async (req, res) => {
  const { id } = req.params;

  await scheduler.unscheduleDilemma(id);
  await prisma.dilemma.delete({ where: { id } });

  res.json({ message: 'Dilemme supprimé' });
}));

export default router;

// ============================================
// src/routes/sponsors.routes.ts
// ============================================

import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';

const router = Router();

// Créer un sponsor
router.post('/', auth, adminOnly, asyncHandler(async (req, res) => {
  const { name, logoUrl, brandColor, email, contactName } = req.body;

  const sponsor = await prisma.sponsor.create({
    data: {
      name,
      logoUrl,
      brandColor,
      email,
      contactName,
    },
  });

  res.status(201).json({
    message: 'Sponsor créé',
    sponsor,
  });
}));

// Lister les sponsors
router.get('/', auth, adminOnly, asyncHandler(async (req, res) => {
  const sponsors = await prisma.sponsor.findMany({
    orderBy: { name: 'asc' },
  });

  res.json({ sponsors });
}));

// Analytics d'un sponsor
router.get('/:id/analytics', auth, adminOnly, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const dilemmas = await prisma.dilemma.findMany({
    where: { sponsorId: id },
    include: {
      _count: {
        select: { votes: true },
      },
      rewards: {
        include: {
          _count: {
            select: { interactions: true },
          },
        },
      },
    },
  });

  const totalDilemmas = dilemmas.length;
  const totalVotes = dilemmas.reduce((sum, d) => sum + d._count.votes, 0);
  const totalInteractions = dilemmas.reduce((sum, d) => 
    sum + d.rewards.reduce((s, r) => s + r._count.interactions, 0), 0
  );

  res.json({
    totalDilemmas,
    totalVotes,
    totalInteractions,
    conversionRate: totalVotes > 0 ? (totalInteractions / totalVotes * 100).toFixed(2) : 0,
    dilemmas,
  });
}));

export default router;