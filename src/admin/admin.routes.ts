import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, authorize, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Global stats (Admin)
router.get('/stats', authenticate, authorize('ADMIN'), async (_req: AuthRequest, res: Response) => {
    try {
        const [totalUsers, totalStudents, totalAccompagnateurs, totalPacks, activeSubscriptions, totalDocuments, totalMessages] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { role: 'STUDENT' } }),
            prisma.user.count({ where: { role: 'ACCOMPAGNATEUR' } }),
            prisma.pack.count(),
            prisma.subscription.count({ where: { status: 'ACTIVE' } }),
            prisma.document.count(),
            prisma.message.count(),
        ]);

        const recentUsers = await prisma.user.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, firstName: true, lastName: true, role: true, createdAt: true },
        });

        const recentActivity = await prisma.activityLog.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
        });

        res.json({
            stats: { totalUsers, totalStudents, totalAccompagnateurs, totalPacks, activeSubscriptions, totalDocuments, totalMessages },
            recentUsers,
            recentActivity,
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Activity logs (Admin)
router.get('/logs', authenticate, authorize('ADMIN'), async (req, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string;
        const actionType = req.query.type as string;

        const where: any = {};
        if (actionType && actionType !== 'ALL') {
            where.action = actionType;
        }
        if (search) {
            where.OR = [
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName: { contains: search, mode: 'insensitive' } } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
            }),
            prisma.activityLog.count({ where })
        ]);

        res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// All subscriptions (Admin)
router.get('/subscriptions', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search as string;
        const status = req.query.status as string;

        const where: any = {};
        if (status && status !== 'ALL') {
            where.status = status;
        }
        if (search) {
            where.user = {
                OR: [
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ]
            };
        }

        const [subscriptions, total] = await Promise.all([
            prisma.subscription.findMany({
                where,
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                    pack: true,
                    payments: { orderBy: { createdAt: 'desc' }, take: 5 },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.subscription.count({ where })
        ]);

        res.json({
            subscriptions,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// Global tracking of all memoires (Admin)
router.get('/tracking', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 5;
        const skip = (page - 1) * limit;
        const search = req.query.search as string || '';
        const phase = req.query.phase as string || 'ALL';
        const coachId = req.query.coachId as string || '';

        const where: any = {};

        if (phase && phase !== 'ALL') {
            where.phase = phase;
        }
        if (coachId) {
            where.accompagnateurId = coachId;
        }
        if (search) {
            where.OR = [
                { student: { firstName: { contains: search, mode: 'insensitive' } } },
                { student: { lastName: { contains: search, mode: 'insensitive' } } },
                { student: { email: { contains: search, mode: 'insensitive' } } },
                { title: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Run all queries in parallel to free up connections faster
        const [phaseCounts, avgProgress, totalMemoires, withCoach, completed, memoires, total, coaches] = await Promise.all([
            prisma.memoireProgress.groupBy({
                by: ['phase'],
                _count: { id: true },
            }),
            prisma.memoireProgress.aggregate({
                _avg: { progressPercent: true },
            }),
            prisma.memoireProgress.count(),
            prisma.memoireProgress.count({ where: { accompagnateurId: { not: null } } }),
            prisma.memoireProgress.count({ where: { phase: 'FINAL' } }),
            prisma.memoireProgress.findMany({
                where,
                include: {
                    student: {
                        select: {
                            id: true, firstName: true, lastName: true,
                            email: true, field: true, university: true,
                            studyLevel: true, targetDefenseDate: true, avatar: true,
                        }
                    },
                    accompagnateur: {
                        select: { id: true, firstName: true, lastName: true }
                    },
                    documents: {
                        select: { id: true, status: true },
                    }
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.memoireProgress.count({ where }),
            prisma.user.findMany({
                where: { role: 'ACCOMPAGNATEUR' },
                select: { id: true, firstName: true, lastName: true },
                orderBy: { firstName: 'asc' }
            })
        ]);

        res.json({
            memoires,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            stats: {
                totalMemoires,
                withCoach,
                withoutCoach: totalMemoires - withCoach,
                completed,
                avgProgress: Math.round(avgProgress._avg.progressPercent || 0),
                phaseCounts,
            },
            coaches,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get public config (Maintenance, Registrations, etc.)
router.get('/config/public', async (_req, res: Response) => {
    try {
        const settings = await prisma.globalSetting.findMany({
            where: {
                key: {
                    in: [
                        'platformName', 'maintenanceMode', 'allowRegistrations',
                        'contactEmail', 'contactPhone', 'contactAddress',
                        'facebookUrl', 'instagramUrl', 'linkedinUrl',
                        'twitterUrl', 'tiktokUrl', 'youtubeUrl'
                    ]
                }
            }
        });
        const configMap: Record<string, string> = {};
        settings.forEach(s => {
            configMap[s.key] = s.value;
        });
        res.json({ settings: configMap });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la récupération de la configuration publique' });
    }
});

// Get global config (Admin) - Robust check for all keys
router.get('/config', authenticate, authorize('ADMIN'), async (_req: AuthRequest, res: Response) => {
    try {
        const existingSettings = await prisma.globalSetting.findMany();

        const requiredKeys = [
            { key: 'platformName', value: 'Clé du Mémoire', description: 'Nom de la plateforme' },
            { key: 'contactEmail', value: 'contact@cledumemoire.sn', description: 'Email de contact principal' },
            { key: 'contactPhone', value: '+221 77 470 74 13', description: 'Téléphone de contact' },
            { key: 'contactAddress', value: 'Dakar, Sénégal — Almadies', description: 'Adresse physique' },
            { key: 'maintenanceMode', value: 'false', description: 'Désactive l\'accès aux étudiants' },
            { key: 'allowRegistrations', value: 'true', description: 'Autoriser les nouvelles inscriptions' },
            { key: 'requireApproval', value: 'false', description: 'Approbation manuelle des nouveaux comptes' },
            { key: 'facebookUrl', value: 'https://facebook.com/cledumemoire', description: 'Lien Facebook' },
            { key: 'instagramUrl', value: 'https://instagram.com/cledumemoire', description: 'Lien Instagram' },
            { key: 'linkedinUrl', value: 'https://linkedin.com/company/cledumemoire', description: 'Lien LinkedIn' },
            { key: 'twitterUrl', value: 'https://twitter.com/cledumemoire', description: 'Lien Twitter (X)' },
            { key: 'tiktokUrl', value: 'https://tiktok.com/@cledumemoire', description: 'Lien TikTok' },
            { key: 'youtubeUrl', value: 'https://youtube.com/@cledumemoire', description: 'Lien YouTube' },
        ];

        let needsUpdate = false;
        const existingKeys = new Set(existingSettings.map(s => s.key));

        for (const req of requiredKeys) {
            if (!existingKeys.has(req.key)) {
                await prisma.globalSetting.create({ data: req });
                needsUpdate = true;
            }
        }

        const settings = needsUpdate ? await prisma.globalSetting.findMany() : existingSettings;
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la récupération de la configuration' });
    }
});

// Update global config bulk (Admin)
router.patch('/config', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { settings } = req.body; // Array of { key, value }

        if (!Array.isArray(settings)) {
            return res.status(400).json({ error: 'Format invalide' });
        }

        for (const item of settings) {
            await prisma.globalSetting.update({
                where: { key: item.key },
                data: { value: String(item.value) }
            });
        }

        const updated = await prisma.globalSetting.findMany();
        res.json({ settings: updated });
    } catch (err) {
        res.status(500).json({ error: 'Erreur lors de la mise à jour de la configuration' });
    }
});

export default router;
