// ============================================
// src/middleware/auth.ts
// ============================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { prisma } from '../config/database';

export interface JwtPayload {
  userId: string;
  email: string;
}

// Étendre le type Request pour inclure l'utilisateur
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        isPremium: boolean;
        isAdmin: boolean;
      };
    }
  }
}

/**
 * Middleware d'authentification JWT
 */
export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Récupérer le token depuis le header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Token manquant ou invalide',
      });
    }

    const token = authHeader.substring(7); // Retirer "Bearer "

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Récupérer l'utilisateur depuis la base de données
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        isPremium: true,
        premiumUntil: true,
        // Ajoutez un champ isAdmin si vous en avez un
      },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Utilisateur non trouvé',
      });
    }

    // Vérifier si le premium est toujours valide
    const isPremium = user.isPremium && (!user.premiumUntil || user.premiumUntil > new Date());

    // Attacher l'utilisateur à la requête
    req.user = {
      id: user.id,
      email: user.email,
      isPremium,
      isAdmin: false, // À implémenter selon votre logique
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Token invalide',
      });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expiré',
      });
    }
    return res.status(500).json({
      error: 'Erreur d\'authentification',
    });
  }
};

// ============================================
// src/middleware/premium.ts
// ============================================

/**
 * Middleware pour vérifier que l'utilisateur est premium
 */
export const premium = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Non authentifié',
    });
  }

  if (!req.user.isPremium) {
    return res.status(403).json({
      error: 'Accès réservé aux utilisateurs premium',
      message: 'Abonnez-vous pour accéder à cette fonctionnalité',
    });
  }

  next();
};

// ============================================
// src/middleware/admin.ts
// ============================================

/**
 * Middleware pour vérifier que l'utilisateur est admin
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Non authentifié',
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      error: 'Accès réservé aux administrateurs',
    });
  }

  next();
};

// ============================================
// src/middleware/errorHandler.ts
// ============================================

import { Prisma } from '@prisma/client';

/**
 * Classe pour les erreurs personnalisées
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Middleware global de gestion des erreurs
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log l'erreur
  console.error('❌ Erreur:', err);

  // Erreur personnalisée AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(config.isDevelopment && { stack: err.stack }),
    });
  }

  // Erreur Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Contrainte unique violée
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Cette ressource existe déjà',
        field: (err.meta?.target as string[])?.[0] || 'unknown',
      });
    }

    // Ressource non trouvée
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Ressource non trouvée',
      });
    }

    // Contrainte de clé étrangère
    if (err.code === 'P2003') {
      return res.status(400).json({
        error: 'Référence invalide',
      });
    }
  }

  // Erreur Prisma de validation
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: 'Données invalides',
      ...(config.isDevelopment && { details: err.message }),
    });
  }

  // Erreur JWT
  if (err instanceof jwt.JsonWebTokenError) {
    return res.status(401).json({
      error: 'Token invalide',
    });
  }

  if (err instanceof jwt.TokenExpiredError) {
    return res.status(401).json({
      error: 'Token expiré',
    });
  }

  // Erreur par défaut
  res.status(500).json({
    error: 'Une erreur interne est survenue',
    ...(config.isDevelopment && { 
      message: err.message,
      stack: err.stack,
    }),
  });
};

// ============================================
// src/middleware/validation.ts
// ============================================

import { validationResult, ValidationChain } from 'express-validator';

/**
 * Middleware pour valider les résultats de express-validator
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Exécuter toutes les validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Récupérer les erreurs
    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

    // Formater les erreurs
    const formattedErrors = errors.array().map(err => ({
      field: err.type === 'field' ? err.path : undefined,
      message: err.msg,
    }));

    res.status(400).json({
      error: 'Validation échouée',
      details: formattedErrors,
    });
  };
};

// ============================================
// src/middleware/async.ts
// ============================================

/**
 * Wrapper pour gérer les erreurs async dans les routes
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};