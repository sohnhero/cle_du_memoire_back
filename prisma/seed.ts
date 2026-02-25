import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create Admin
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@cledu memoire.sn' },
        update: {},
        create: {
            email: 'admin@cledumemoire.sn',
            password: adminPassword,
            firstName: 'Administrateur',
            lastName: 'Système',
            role: 'ADMIN',
            phone: '+221 77 000 0000',
        },
    });

    // Create Accompagnateurs
    const coachPassword = await bcrypt.hash('coach123', 12);
    const coach1 = await prisma.user.upsert({
        where: { email: 'coach1@cledumemoire.sn' },
        update: {},
        create: {
            email: 'coach1@cledumemoire.sn',
            password: coachPassword,
            firstName: 'Amadou',
            lastName: 'Diallo',
            role: 'ACCOMPAGNATEUR',
            phone: '+221 77 111 1111',
            university: 'UCAD',
            field: 'Sciences de Gestion',
        },
    });

    const coach2 = await prisma.user.upsert({
        where: { email: 'coach2@cledumemoire.sn' },
        update: {},
        create: {
            email: 'coach2@cledumemoire.sn',
            password: coachPassword,
            firstName: 'Fatou',
            lastName: 'Ndiaye',
            role: 'ACCOMPAGNATEUR',
            phone: '+221 77 222 2222',
            university: 'UGB',
            field: 'Informatique',
        },
    });

    // Create Students
    const studentPassword = await bcrypt.hash('student123', 12);
    const student1 = await prisma.user.upsert({
        where: { email: 'etudiant1@test.sn' },
        update: {},
        create: {
            email: 'etudiant1@test.sn',
            password: studentPassword,
            firstName: 'Moussa',
            lastName: 'Diop',
            role: 'STUDENT',
            phone: '+221 78 333 3333',
            university: 'UCAD',
            field: 'Master Informatique',
        },
    });

    const student2 = await prisma.user.upsert({
        where: { email: 'etudiant2@test.sn' },
        update: {},
        create: {
            email: 'etudiant2@test.sn',
            password: studentPassword,
            firstName: 'Aïssatou',
            lastName: 'Ba',
            role: 'STUDENT',
            phone: '+221 78 444 4444',
            university: 'ESP',
            field: 'Master Marketing',
        },
    });

    // Create Packs
    const packs = await Promise.all([
        prisma.pack.upsert({
            where: { id: 'pack-demarrage' },
            update: {},
            create: {
                id: 'pack-demarrage',
                name: 'Pack Démarrage',
                description: 'Idéal pour bien démarrer votre mémoire. Inclut le choix du sujet, la problématique et le plan détaillé.',
                price: 50000,
                features: JSON.stringify([
                    'Aide au choix du sujet',
                    'Formulation de la problématique',
                    'Élaboration du plan détaillé',
                    'Recherche bibliographique guidée',
                    '2 séances de coaching',
                ]),
                sortOrder: 1,
            },
        }),
        prisma.pack.upsert({
            where: { id: 'pack-redaction' },
            update: {},
            create: {
                id: 'pack-redaction',
                name: 'Pack Rédaction',
                description: 'Accompagnement complet de la rédaction. Paiement en 2 tranches : 75 000 FCFA + 25 000 FCFA.',
                price: 100000,
                installment1: 75000,
                installment2: 25000,
                features: JSON.stringify([
                    'Accompagnement rédactionnel complet',
                    'Relecture de chaque chapitre',
                    'Corrections et suggestions',
                    'Mise en forme académique',
                    '6 séances de coaching',
                    'Support WhatsApp illimité',
                ]),
                sortOrder: 2,
            },
        }),
        prisma.pack.upsert({
            where: { id: 'pack-soutenance' },
            update: {},
            create: {
                id: 'pack-soutenance',
                name: 'Pack Soutenance',
                description: 'Préparation intensive à la soutenance. Entraînement, slides et simulation.',
                price: 65000,
                features: JSON.stringify([
                    'Préparation des slides de présentation',
                    'Simulation de soutenance',
                    'Coaching prise de parole',
                    'Anticipation des questions du jury',
                    '3 séances de simulation',
                ]),
                sortOrder: 3,
            },
        }),
        prisma.pack.upsert({
            where: { id: 'pack-complet' },
            update: {},
            create: {
                id: 'pack-complet',
                name: 'Pack Complet',
                description: 'L\'accompagnement ultime du début à la fin. Paiement en 2 tranches : 100 000 FCFA + 50 000 FCFA.',
                price: 150000,
                installment1: 100000,
                installment2: 50000,
                features: JSON.stringify([
                    'Tout le Pack Démarrage',
                    'Tout le Pack Rédaction',
                    'Tout le Pack Soutenance',
                    'Accompagnateur dédié',
                    'Coaching illimité',
                    'Priorité de traitement',
                    'Garantie satisfaction',
                ]),
                sortOrder: 4,
            },
        }),
    ]);

    // Create subscriptions for students
    await prisma.subscription.create({
        data: {
            userId: student1.id,
            packId: 'pack-complet',
            status: 'ACTIVE',
            amountPaid: 100000,
            activatedAt: new Date(),
        },
    });

    await prisma.subscription.create({
        data: {
            userId: student2.id,
            packId: 'pack-demarrage',
            status: 'ACTIVE',
            amountPaid: 50000,
            activatedAt: new Date(),
        },
    });

    // Create memoire progress
    await prisma.memoireProgress.create({
        data: {
            studentId: student1.id,
            accompagnateurId: coach1.id,
            title: 'Impact de la digitalisation sur les PME sénégalaises',
            phase: 'CHAPTER2',
            progressPercent: 55,
            notes: 'Bon avancement. Le chapitre 2 est en cours de rédaction.',
        },
    });

    await prisma.memoireProgress.create({
        data: {
            studentId: student2.id,
            accompagnateurId: coach2.id,
            title: 'Stratégies de marketing digital pour les startups africaines',
            phase: 'OUTLINE',
            progressPercent: 15,
            notes: 'Plan détaillé en cours de validation.',
        },
    });

    console.log('✅ Database seeded successfully!');
    console.log(`  - Admin: admin@cledumemoire.sn / admin123`);
    console.log(`  - Coach: coach1@cledumemoire.sn / coach123`);
    console.log(`  - Student: etudiant1@test.sn / student123`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
