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
import { validate } from '../middleware/errorHandler';

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

router.post('/request', auth, asyncHandler(async (req, res) => {
  const { friendUsername } = req.body;

  const friend = await prisma.user.findUnique({
    where: { username: friendUsername },
  });

  if (!friend) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  if (friend.id === req.user!.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas vous ajouter vous-même' });
  }

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
import { validate, asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';

const router = Router();

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
import { validate } from '../middleware/errorHandler';
import * as adminController from '../controllers/admin.controller';

const router = Router();

const createDilemmaValidation = [
  body('question').notEmpty().withMessage('Question requise'),
  body('optionA').notEmpty().withMessage('Option A requise'),
  body('optionB').notEmpty().withMessage('Option B requise'),
  body('publishDate').isISO8601().withMessage('Date de publication invalide'),
  body('isSponsored').optional().isBoolean(),
  body('sponsorId').optional().isUUID(),
];

router.post('/dilemmas', auth, adminOnly, validate(createDilemmaValidation), adminController.createDilemma);
router.get('/dilemmas', auth, adminOnly, adminController.listDilemmas);
router.put('/dilemmas/:id', auth, adminOnly, adminController.updateDilemma);
router.delete('/dilemmas/:id', auth, adminOnly, adminController.deleteDilemma);

export default router;

// ============================================
// src/routes/sponsors.routes.ts
// ============================================

import { Router } from 'express';
import { auth, adminOnly } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';

const router = Router();

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

router.get('/', auth, adminOnly, asyncHandler(async (req, res) => {
  const sponsors = await prisma.sponsor.findMany({
    orderBy: { name: 'asc' },
  });

  res.json({ sponsors });
}));

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