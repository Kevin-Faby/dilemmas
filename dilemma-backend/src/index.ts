import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import { prisma, redis } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { SchedulerService } from './services/scheduler.service';

// Routes
import authRoutes from './routes/auth.routes';
import dilemmaRoutes from './routes/dilemmas.routes';
import voteRoutes from './routes/votes.routes';
import statsRoutes from './routes/stats.routes';
import friendRoutes from './routes/friends.routes';
import adminRoutes from './routes/admin.routes';
import sponsorRoutes from './routes/sponsors.routes';
import userRoutes from './routes/users.routes';

const app = express();

// ============================================
// MIDDLEWARES GLOBAUX
// ============================================

// Sécurité
app.use(helmet());

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

// Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (config.isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting global
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Trop de requêtes, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  try {
    // Vérifier la connexion à la base de données
    await prisma.$queryRaw`SELECT 1`;
    
    // Vérifier la connexion à Redis
    await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// ROUTES API
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/dilemmas', dilemmaRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sponsors', sponsorRoutes);

// Route 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
  });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use(errorHandler);

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

const startServer = async () => {
  try {
    // Vérifier la connexion à la base de données
    await prisma.$connect();
    console.log('✅ Base de données connectée');

    // Vérifier la connexion à Redis
    await redis.ping();
    console.log('✅ Redis connecté');

    // Initialiser le scheduler pour les dilemmes
    const scheduler = new SchedulerService();
    await scheduler.init();
    console.log('✅ Scheduler initialisé');

    // Démarrer le serveur
    const server = app.listen(config.port, () => {
      console.log(`
╔════════════════════════════════════════════╗
║   🚀 Serveur démarré avec succès !        ║
║                                            ║
║   📍 URL: http://localhost:${config.port}        ║
║   🌍 Environnement: ${config.nodeEnv.padEnd(18)}║
║   📅 Démarré le: ${new Date().toLocaleString('fr-FR').padEnd(17)}║
╚════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n⚠️  Signal ${signal} reçu, arrêt en cours...`);
      
      server.close(async () => {
        console.log('🔌 Serveur HTTP fermé');
        
        await prisma.$disconnect();
        console.log('🔌 Base de données déconnectée');
        
        await redis.quit();
        console.log('🔌 Redis déconnecté');
        
        await scheduler.shutdown();
        console.log('🔌 Scheduler arrêté');
        
        console.log('✅ Arrêt gracieux terminé');
        process.exit(0);
      });

      // Forcer l'arrêt après 10 secondes
      setTimeout(() => {
        console.error('⚠️  Arrêt forcé après timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Erreur au démarrage du serveur:', error);
    process.exit(1);
  }
};

// Démarrer l'application
startServer();

export default app;