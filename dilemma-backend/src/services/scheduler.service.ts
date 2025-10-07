import Bull, { Queue, Job } from 'bull';
import { prisma, CacheService } from '../config/database';
import { config } from '../config/env';

interface DilemmaJobData {
  dilemmaId: string;
}

export class SchedulerService {
  private queue: Queue<DilemmaJobData>;

  constructor() {
    this.queue = new Bull<DilemmaJobData>('dilemma-scheduler', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Garder les 100 derniers jobs complétés
        removeOnFail: 500, // Garder les 500 derniers jobs échoués
        attempts: 3, // Nombre de tentatives
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  }

  /**
   * Initialiser le scheduler
   */
  async init() {
    // Configurer les workers
    this.setupWorkers();

    // Planifier tous les dilemmes futurs
    await this.scheduleFutureDilemmas();

    // Configurer un cron job pour re-vérifier quotidiennement
    await this.setupDailyCron();

    console.log('✅ Scheduler initialisé');
  }

  /**
   * Configurer les workers pour traiter les jobs
   */
  private setupWorkers() {
    // Worker: Publication d'un dilemme
    this.queue.process('publish', async (job: Job<DilemmaJobData>) => {
      const { dilemmaId } = job.data;
      console.log(`📢 Publication du dilemme ${dilemmaId}`);

      try {
        // Invalider les caches
        await CacheService.del('dilemma:today', 'dilemma:tomorrow');

        // Vous pouvez ajouter ici :
        // - Envoi de notifications push aux utilisateurs
        // - Mise à jour d'un statut
        // - Analytics

        // Exemple de notification (à implémenter)
        // await this.sendPushNotification(dilemmaId);

        console.log(`✅ Dilemme ${dilemmaId} publié avec succès`);
      } catch (error) {
        console.error(`❌ Erreur lors de la publication du dilemme ${dilemmaId}:`, error);
        throw error; // Bull retentera automatiquement
      }
    });

    // Worker: Révélation des résultats (20h)
    this.queue.process('reveal', async (job: Job<DilemmaJobData>) => {
      const { dilemmaId } = job.data;
      console.log(`🎉 Révélation des résultats du dilemme ${dilemmaId}`);

      try {
        // Invalider tous les caches de stats
        await CacheService.delPattern(`stats:*:${dilemmaId}*`);

        // Pré-calculer les statistiques pour améliorer les performances
        await this.precalculateStats(dilemmaId);

        // Envoyer les notifications avec les résultats
        // await this.sendResultsNotification(dilemmaId);

        console.log(`✅ Résultats du dilemme ${dilemmaId} révélés`);
      } catch (error) {
        console.error(`❌ Erreur lors de la révélation du dilemme ${dilemmaId}:`, error);
        throw error;
      }
    });

    // Worker: Planification quotidienne
    this.queue.process('daily-scheduler', async () => {
      console.log('🕐 Exécution de la planification quotidienne');
      await this.scheduleFutureDilemmas();
    });

    // Events
    this.queue.on('completed', (job) => {
      console.log(`✅ Job ${job.id} (${job.name}) terminé`);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} (${job?.name}) échoué:`, err);
    });
  }

  /**
   * Planifier tous les dilemmes futurs
   */
  private async scheduleFutureDilemmas() {
    // Récupérer tous les dilemmes futurs non encore planifiés
    const futureDilemmas = await prisma.dilemma.findMany({
      where: {
        publishDate: {
          gt: new Date(),
        },
      },
      orderBy: {
        publishDate: 'asc',
      },
    });

    console.log(`📅 ${futureDilemmas.length} dilemmes à planifier`);

    for (const dilemma of futureDilemmas) {
      await this.scheduleDilemma(dilemma.id, dilemma.publishDate, dilemma.revealTime);
    }
  }

  /**
   * Planifier un dilemme spécifique
   */
  async scheduleDilemma(dilemmaId: string, publishDate: Date, revealTime: Date) {
    const now = Date.now();
    const publishDelay = publishDate.getTime() - now;
    const revealDelay = revealTime.getTime() - now;

    // Planifier la publication (si dans le futur)
    if (publishDelay > 0) {
      await this.queue.add(
        'publish',
        { dilemmaId },
        {
          delay: publishDelay,
          jobId: `publish-${dilemmaId}`,
        }
      );
      console.log(`📅 Publication planifiée pour le dilemme ${dilemmaId} le ${publishDate.toLocaleString('fr-FR')}`);
    }

    // Planifier la révélation (si dans le futur)
    if (revealDelay > 0) {
      await this.queue.add(
        'reveal',
        { dilemmaId },
        {
          delay: revealDelay,
          jobId: `reveal-${dilemmaId}`,
        }
      );
      console.log(`📅 Révélation planifiée pour le dilemme ${dilemmaId} le ${revealTime.toLocaleString('fr-FR')}`);
    }
  }

  /**
   * Annuler la planification d'un dilemme
   */
  async unscheduleDilemma(dilemmaId: string) {
    const publishJobId = `publish-${dilemmaId}`;
    const revealJobId = `reveal-${dilemmaId}`;

    const [publishJob, revealJob] = await Promise.all([
      this.queue.getJob(publishJobId),
      this.queue.getJob(revealJobId),
    ]);

    if (publishJob) {
      await publishJob.remove();
      console.log(`🗑️  Publication annulée pour ${dilemmaId}`);
    }

    if (revealJob) {
      await revealJob.remove();
      console.log(`🗑️  Révélation annulée pour ${dilemmaId}`);
    }
  }

  /**
   * Re-planifier un dilemme (utile quand on modifie les dates)
   */
  async rescheduleDilemma(dilemmaId: string, publishDate: Date, revealTime: Date) {
    await this.unscheduleDilemma(dilemmaId);
    await this.scheduleDilemma(dilemmaId, publishDate, revealTime);
  }

  /**
   * Configurer le cron quotidien (tous les jours à minuit)
   */
  private async setupDailyCron() {
    await this.queue.add(
      'daily-scheduler',
      {},
      {
        repeat: {
          cron: '0 0 * * *', // Tous les jours à minuit
        },
        jobId: 'daily-scheduler',
      }
    );
    console.log('⏰ Cron quotidien configuré (minuit)');
  }

  /**
   * Pré-calculer les statistiques pour améliorer les performances
   */
  private async precalculateStats(dilemmaId: string) {
    try {
      // Calculer les stats globales
      const totalVotes = await prisma.vote.count({
        where: { dilemmaId },
      });

      const votesA = await prisma.vote.count({
        where: { dilemmaId, choice: 'A' },
      });

      const stats = {
        totalVotes,
        choiceA: {
          count: votesA,
          percentage: totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 0,
        },
        choiceB: {
          count: totalVotes - votesA,
          percentage: totalVotes > 0 ? Math.round(((totalVotes - votesA) / totalVotes) * 100) : 0,
        },
      };

      // Mettre en cache
      await CacheService.set(`stats:global:${dilemmaId}`, stats, 3600); // 1 heure

      console.log(`📊 Stats pré-calculées pour ${dilemmaId}: ${totalVotes} votes`);
    } catch (error) {
      console.error('Erreur lors du pré-calcul des stats:', error);
    }
  }

  /**
   * Obtenir les statistiques du scheduler
   */
  async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Obtenir les jobs à venir
   */
  async getUpcomingJobs(limit: number = 10) {
    const jobs = await this.queue.getDelayed(0, limit);
    
    return jobs.map(job => ({
      id: job.id,
      type: job.name,
      dilemmaId: job.data.dilemmaId,
      scheduledFor: new Date(job.timestamp + (job.opts.delay || 0)),
    }));
  }

  /**
   * Nettoyer les anciens jobs
   */
  async cleanup() {
    await this.queue.clean(7 * 24 * 60 * 60 * 1000, 'completed'); // 7 jours
    await this.queue.clean(30 * 24 * 60 * 60 * 1000, 'failed'); // 30 jours
    console.log('🧹 Nettoyage des anciens jobs effectué');
  }

  /**
   * Arrêter le scheduler proprement
   */
  async shutdown() {
    await this.queue.close();
    console.log('🔌 Scheduler arrêté');
  }

  /**
   * Méthodes pour les notifications (à implémenter selon vos besoins)
   */
  
  // private async sendPushNotification(dilemmaId: string) {
  //   const dilemma = await prisma.dilemma.findUnique({
  //     where: { id: dilemmaId },
  //   });
  //
  //   if (!dilemma) return;
  //
  //   // Utiliser Firebase Cloud Messaging ou autre service
  //   // const message = {
  //   //   notification: {
  //   //     title: '🤔 Nouveau dilemme du jour !',
  //   //     body: dilemma.question,
  //   //   },
  //   // };
  //   
  //   // await fcm.send(message);
  // }

  // private async sendResultsNotification(dilemmaId: string) {
  //   // Envoyer une notification avec les résultats
  //   // const stats = await this.precalculateStats(dilemmaId);
  //   // ...
  // }
}