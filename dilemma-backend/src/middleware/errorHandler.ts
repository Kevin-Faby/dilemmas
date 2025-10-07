// ============================================
// src/middleware/errorHandler.ts
// ============================================

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { validationResult, ValidationChain } from 'express-validator';
import { config } from '../config/env';

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

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('❌ Erreur:', err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(config.isDevelopment && { stack: err.stack }),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Cette ressource existe déjà',
        field: (err.meta?.target as string[])?.[0] || 'unknown',
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Ressource non trouvée',
      });
    }

    if (err.code === 'P2003') {
      return res.status(400).json({
        error: 'Référence invalide',
      });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      error: 'Données invalides',
      ...(config.isDevelopment && { details: err.message }),
    });
  }

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

  res.status(500).json({
    error: 'Une erreur interne est survenue',
    ...(config.isDevelopment && { 
      message: err.message,
      stack: err.stack,
    }),
  });
};

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    
    if (errors.isEmpty()) {
      return next();
    }

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

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================
// src/middleware/premium.ts
// ============================================

import { Request, Response, NextFunction } from 'express';

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