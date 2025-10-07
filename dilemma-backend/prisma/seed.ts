import { PrismaClient, Gender, Choice } from '@prisma/client';
import bcrypt from 'bcrypt';
import { addDays, setHours, setMinutes, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Début du seeding...');

  // Nettoyer la base de données
  await prisma.rewardInteraction.deleteMany();
  await prisma.sponsorReward.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.dilemma.deleteMany();
  await prisma.sponsor.deleteMany();
  await prisma.user.deleteMany();

  console.log('🗑️  Base de données nettoyée');

  // ============================================
  // UTILISATEURS
  // ============================================

  const passwordHash = await bcrypt.hash('password123', 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@dilemma.com',
        username: 'admin',
        passwordHash,
        isPremium: true,
        premiumUntil: addDays(new Date(), 365),
        gender: Gender.MALE,
        birthDate: new Date('1990-01-15'),
        region: 'FR',
      },
    }),
    prisma.user.create({
      data: {
        email: 'alice@example.com',
        username: 'alice',
        passwordHash,
        isPremium: true,
        premiumUntil: addDays(new Date(), 30),
        gender: Gender.FEMALE,
        birthDate: new Date('1995-06-20'),
        region: 'FR',
      },
    }),
    prisma.user.create({
      data: {
        email: 'bob@example.com',
        username: 'bob',
        passwordHash,
        isPremium: false,
        gender: Gender.MALE,
        birthDate: new Date('1988-03-10'),
        region: 'FR',
      },
    }),
    prisma.user.create({
      data: {
        email: 'charlie@example.com',
        username: 'charlie',
        passwordHash,
        isPremium: false,
        gender: Gender.MALE,
        birthDate: new Date('2000-12-05'),
        region: 'BE',
      },
    }),
    prisma.user.create({
      data: {
        email: 'diana@example.com',
        username: 'diana',
        passwordHash,
        isPremium: false,
        gender: Gender.FEMALE,
        birthDate: new Date('1992-08-25'),
        region: 'CH',
      },
    }),
  ]);

  console.log(`✅ ${users.length} utilisateurs créés`);

  // ============================================
  // AMITIÉS
  // ============================================

  await Promise.all([
    // Alice et Bob sont amis
    prisma.friendship.create({
      data: {
        userId: users[1].id,
        friendId: users[2].id,
        status: 'ACCEPTED',
      },
    }),
    // Alice et Charlie sont amis
    prisma.friendship.create({
      data: {
        userId: users[1].id,
        friendId: users[3].id,
        status: 'ACCEPTED',
      },
    }),
    // Diana a envoyé une demande à Bob (en attente)
    prisma.friendship.create({
      data: {
        userId: users[4].id,
        friendId: users[2].id,
        status: 'PENDING',
      },
    }),
  ]);

  console.log('✅ Amitiés créées');

  // ============================================
  // SPONSORS
  // ============================================

  const sponsors = await Promise.all([
    prisma.sponsor.create({
      data: {
        name: 'McDonald\'s',
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/36/McDonald%27s_Golden_Arches.svg',
        brandColor: '#FFC72C',
        email: 'marketing@mcdonalds.fr',
        contactName: 'Marie Dupont',
      },
    }),
    prisma.sponsor.create({
      data: {
        name: 'Nike',
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg',
        brandColor: '#FF6B00',
        email: 'brand@nike.com',
        contactName: 'Jean Martin',
      },
    }),
    prisma.sponsor.create({
      data: {
        name: 'Coca-Cola',
        logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Coca-Cola_logo.svg',
        brandColor: '#F40009',
        email: 'partnerships@coca-cola.com',
        contactName: 'Sophie Laurent',
      },
    }),
  ]);

  console.log(`✅ ${sponsors.length} sponsors créés`);

  // ============================================
  // DILEMMES
  // ============================================

  const today = new Date();
  const yesterday = subDays(today, 1);
  const twoDaysAgo = subDays(today, 2);
  const tomorrow = addDays(today, 1);

  // Fonction helper pour créer l'heure de révélation (20h)
  const getRevealTime = (date: Date) => setMinutes(setHours(date, 20), 0);

  const dilemmas = await Promise.all([
    // Dilemme d'il y a 2 jours (non sponsorisé)
    prisma.dilemma.create({
      data: {
        question: 'Préférez-vous vivre sans musique ou sans films ?',
        optionA: 'Sans musique',
        optionB: 'Sans films',
        publishDate: twoDaysAgo,
        revealTime: getRevealTime(twoDaysAgo),
        isSponsored: false,
      },
    }),

    // Dilemme d'hier (sponsorisé McDonald's)
    prisma.dilemma.create({
      data: {
        question: 'Avec vos frites : Ketchup ou Mayonnaise ?',
        optionA: 'Ketchup',
        optionB: 'Mayonnaise',
        publishDate: yesterday,
        revealTime: getRevealTime(yesterday),
        isSponsored: true,
        sponsorId: sponsors[0].id,
      },
    }),

    // Dilemme du jour (sponsorisé Nike)
    prisma.dilemma.create({
      data: {
        question: 'Pour rester en forme : Courir ou Faire de la musculation ?',
        optionA: 'Courir',
        optionB: 'Musculation',
        publishDate: today,
        revealTime: getRevealTime(today),
        isSponsored: true,
        sponsorId: sponsors[1].id,
      },
    }),

    // Dilemme de demain (non sponsorisé)
    prisma.dilemma.create({
      data: {
        question: 'Préférez-vous avoir le pouvoir de voler ou d\'être invisible ?',
        optionA: 'Voler',
        optionB: 'Être invisible',
        publishDate: tomorrow,
        revealTime: getRevealTime(tomorrow),
        isSponsored: false,
      },
    }),

    // Quelques dilemmes supplémentaires dans l'historique
    prisma.dilemma.create({
      data: {
        question: 'Chat ou Chien ?',
        optionA: 'Chat',
        optionB: 'Chien',
        publishDate: subDays(today, 3),
        revealTime: getRevealTime(subDays(today, 3)),
        isSponsored: false,
      },
    }),

    prisma.dilemma.create({
      data: {
        question: 'Thé ou Café le matin ?',
        optionA: 'Thé',
        optionB: 'Café',
        publishDate: subDays(today, 4),
        revealTime: getRevealTime(subDays(today, 4)),
        isSponsored: true,
        sponsorId: sponsors[2].id,
      },
    }),
  ]);

  console.log(`✅ ${dilemmas.length} dilemmes créés`);

  // ============================================
  // RÉCOMPENSES SPONSORS
  // ============================================

  await Promise.all([
    // Récompense McDonald's (pour le choix Ketchup)
    prisma.sponsorReward.create({
      data: {
        dilemmaId: dilemmas[1].id, // Dilemme d'hier
        sponsorId: sponsors[0].id,
        choiceTarget: 'A', // Ketchup
        rewardType: 'CODE',
        rewardContent: 'KETCHUP20',
        message: 'Merci d\'avoir voté ! Voici -20% sur votre prochain menu 🍟',
        expiresAt: addDays(new Date(), 30),
      },
    }),

    // Récompense McDonald's (pour le choix Mayonnaise)
    prisma.sponsorReward.create({
      data: {
        dilemmaId: dilemmas[1].id,
        sponsorId: sponsors[0].id,
        choiceTarget: 'B', // Mayonnaise
        rewardType: 'CODE',
        rewardContent: 'MAYO20',
        message: 'Merci d\'avoir voté ! Voici -20% sur votre prochain menu 🍟',
        expiresAt: addDays(new Date(), 30),
      },
    }),

    // Récompense Nike (pour tous)
    prisma.sponsorReward.create({
      data: {
        dilemmaId: dilemmas[2].id, // Dilemme d'aujourd'hui
        sponsorId: sponsors[1].id,
        choiceTarget: 'BOTH',
        rewardType: 'LINK',
        rewardContent: 'https://nike.com/promo/running-special',
        message: 'Découvrez notre collection running avec -30% ! 🏃‍♂️',
        expiresAt: addDays(new Date(), 7),
      },
    }),

    // Récompense Coca-Cola
    prisma.sponsorReward.create({
      data: {
        dilemmaId: dilemmas[5].id,
        sponsorId: sponsors[2].id,
        choiceTarget: 'BOTH',
        rewardType: 'IMAGE',
        rewardContent: 'https://example.com/coupon-coca.png',
        message: 'Voici un coupon pour une boisson gratuite ! 🥤',
        expiresAt: addDays(new Date(), 14),
      },
    }),
  ]);

  console.log('✅ Récompenses sponsors créées');

  // ============================================
  // VOTES
  // ============================================

  const votes = [];

  // Dilemme d'il y a 2 jours - Tous les utilisateurs ont voté
  for (const user of users) {
    votes.push(
      prisma.vote.create({
        data: {
          userId: user.id,
          dilemmaId: dilemmas[0].id,
          choice: Math.random() > 0.5 ? Choice.A : Choice.B,
          votedAt: subDays(today, 2),
        },
      })
    );
  }

  // Dilemme d'hier (McDonald's) - 4 utilisateurs ont voté
  votes.push(
    prisma.vote.create({
      data: {
        userId: users[0].id,
        dilemmaId: dilemmas[1].id,
        choice: Choice.A, // Ketchup
      },
    }),
    prisma.vote.create({
      data: {
        userId: users[1].id,
        dilemmaId: dilemmas[1].id,
        choice: Choice.A, // Ketchup
      },
    }),
    prisma.vote.create({
      data: {
        userId: users[2].id,
        dilemmaId: dilemmas[1].id,
        choice: Choice.B, // Mayonnaise
      },
    }),
    prisma.vote.create({
      data: {
        userId: users[3].id,
        dilemmaId: dilemmas[1].id,
        choice: Choice.A, // Ketchup
      },
    })
  );

  // Dilemme d'aujourd'hui (Nike) - 2 utilisateurs ont déjà voté
  votes.push(
    prisma.vote.create({
      data: {
        userId: users[1].id,
        dilemmaId: dilemmas[2].id,
        choice: Choice.A, // Courir
      },
    }),
    prisma.vote.create({
      data: {
        userId: users[2].id,
        dilemmaId: dilemmas[2].id,
        choice: Choice.B, // Musculation
      },
    })
  );

  // Dilemmes plus anciens
  for (let i = 4; i < 6; i++) {
    for (const user of users) {
      votes.push(
        prisma.vote.create({
          data: {
            userId: user.id,
            dilemmaId: dilemmas[i].id,
            choice: Math.random() > 0.4 ? Choice.A : Choice.B,
          },
        })
      );
    }
  }

  await Promise.all(votes);

  console.log(`✅ ${votes.length} votes créés`);

  // ============================================
  // INTERACTIONS RÉCOMPENSES
  // ============================================

  const rewards = await prisma.sponsorReward.findMany();

  await Promise.all([
    // Alice a vu et copié le code McDonald's
    prisma.rewardInteraction.create({
      data: {
        userId: users[1].id,
        rewardId: rewards[0].id,
        action: 'VIEW',
      },
    }),
    prisma.rewardInteraction.create({
      data: {
        userId: users[1].id,
        rewardId: rewards[0].id,
        action: 'COPY',
      },
    }),

    // Admin a vu le code
    prisma.rewardInteraction.create({
      data: {
        userId: users[0].id,
        rewardId: rewards[0].id,
        action: 'VIEW',
      },
    }),

    // Bob a cliqué sur le lien Nike
    prisma.rewardInteraction.create({
      data: {
        userId: users[2].id,
        rewardId: rewards[2].id,
        action: 'VIEW',
      },
    }),
    prisma.rewardInteraction.create({
      data: {
        userId: users[2].id,
        rewardId: rewards[2].id,
        action: 'CLICK',
      },
    }),
  ]);

  console.log('✅ Interactions récompenses créées');

  // ============================================
  // RÉSUMÉ
  // ============================================

  const stats = {
    users: await prisma.user.count(),
    dilemmas: await prisma.dilemma.count(),
    votes: await prisma.vote.count(),
    sponsors: await prisma.sponsor.count(),
    friendships: await prisma.friendship.count(),
    rewards: await prisma.sponsorReward.count(),
  };

  console.log('\n📊 RÉSUMÉ DU SEEDING:');
  console.log('════════════════════════════════');
  console.log(`👥 Utilisateurs:        ${stats.users}`);
  console.log(`🤔 Dilemmes:            ${stats.dilemmas}`);
  console.log(`🗳️  Votes:               ${stats.votes}`);
  console.log(`🏢 Sponsors:            ${stats.sponsors}`);
  console.log(`👫 Amitiés:             ${stats.friendships}`);
  console.log(`🎁 Récompenses:         ${stats.rewards}`);
  console.log('════════════════════════════════');

  console.log('\n✅ Seeding terminé avec succès !');
  console.log('\n📝 COMPTES DE TEST:');
  console.log('════════════════════════════════');
  console.log('Admin:');
  console.log('  Email: admin@dilemma.com');
  console.log('  Password: password123');
  console.log('  Premium: Oui');
  console.log('\nAlice (Premium):');
  console.log('  Email: alice@example.com');
  console.log('  Password: password123');
  console.log('\nBob (Free):');
  console.log('  Email: bob@example.com');
  console.log('  Password: password123');
  console.log('════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });