/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create Admin
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@cledumemoire.sn' },
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
                name: 'Pack 50 000 CFA',
                description: 'Pour bien démarrer votre mémoire. Paiement unique à l\'inscription.',
                price: 50000,
                installment1: null,
                installment2: null,
                features: JSON.stringify([
                    'Choix du sujet : Un sujet pertinent et adapté à vos objectifs académiques.',
                    'Problématique : Une problématique claire et précise pour orienter vos recherches.',
                    'Plan détaillé : Une structure logique et cohérente pour votre mémoire.',
                    'Contexte : Une introduction bien définie pour poser les bases de votre mémoire.',
                    'Objectifs : Un accompagnement pour identifier et formuler vos objectifs.',
                ]),
                sortOrder: 1,
            },
        }),
        prisma.pack.upsert({
            where: { id: 'pack-redaction' },
            update: {},
            create: {
                id: 'pack-redaction',
                name: 'Pack 100 000 CFA',
                description: 'Pour une rédaction de qualité. Paiement en 2 tranches : 75 000 CFA à l\'inscription + 25 000 CFA à la fin.',
                price: 100000,
                installment1: 75000,
                installment2: 25000,
                features: JSON.stringify([
                    'Suivi de la rédaction : Accompagnement tout au long de votre rédaction.',
                    'Lecture approfondie : Vérification de la cohérence et de la clarté.',
                    'Correction complète : Identification et correction des fautes d’orthographe et de grammaire.',
                ]),
                sortOrder: 2,
            },
        }),
        prisma.pack.upsert({
            where: { id: 'pack-soutenance' },
            update: {},
            create: {
                id: 'pack-soutenance',
                name: 'Pack 65 000 CFA',
                description: 'Pour une soutenance professionnelle et réussie. Paiement unique à l\'inscription.',
                price: 65000,
                installment1: null,
                installment2: null,
                features: JSON.stringify([
                    'PowerPoint professionnel : Création d’une présentation esthétique et structurée.',
                    'Simulations régulières : 5 séances de simulation pour vous préparer à répondre aux questions du jury.',
                ]),
                sortOrder: 3,
            },
        }),
        prisma.pack.upsert({
            where: { id: 'pack-complet' },
            update: {},
            create: {
                id: 'pack-complet',
                name: 'Pack Complet : 150 000 CFA',
                description: 'Pour un accompagnement de A à Z. Paiement en 2 tranches : 100 000 CFA à l\'inscription + 50 000 CFA à la fin.',
                price: 150000,
                installment1: 100000,
                installment2: 50000,
                features: JSON.stringify([
                    'Tous les services des packs précédents.',
                    'Choix du sujet et formulation de la problématique.',
                    'Plan détaillé et définition du contexte.',
                    'Suivi de la rédaction, lecture et corrections complètes.',
                    'PowerPoint professionnel et 5 séances de simulation.',
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

    // Create Global Settings
    const initialSettings = [
        { key: 'platformName', value: 'Clé du Mémoire', description: 'Nom de la plateforme' },
        { key: 'contactEmail', value: 'cledumemoire.sn@gmail.com', description: 'Email de contact principal' },
        { key: 'contactPhone', value: '+221 77 470 7413', description: 'Téléphone de contact' },
        { key: 'contactAddress', value: 'Dakar, Sénégal — Almadies', description: 'Adresse physique' },
        { key: 'maintenanceMode', value: 'false', description: 'Désactive l\'accès aux étudiants' },
        { key: 'allowRegistrations', value: 'true', description: 'Autoriser les nouvelles inscriptions' },
        { key: 'requireApproval', value: 'false', description: 'Approbation manuelle des nouveaux comptes' },
        { key: 'facebookUrl', value: 'https://facebook.com/cledumemoire', description: 'Lien Facebook' },
        { key: 'instagramUrl', value: 'https://instagram.com/cledumemoire', description: 'Lien Instagram' },
        { key: 'linkedinUrl', value: 'https://linkedin.com/company/cledumemoire', description: 'Lien LinkedIn' },
    ];

    for (const setting of initialSettings) {
        await prisma.globalSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: setting,
        });
    }

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
