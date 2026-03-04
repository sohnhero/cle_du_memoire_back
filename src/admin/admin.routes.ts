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

        // Stats by phase (global, no filter)
        const phaseCounts = await prisma.memoireProgress.groupBy({
            by: ['phase'],
            _count: { id: true },
        });

        const avgProgress = await prisma.memoireProgress.aggregate({
            _avg: { progressPercent: true },
        });

        const totalMemoires = await prisma.memoireProgress.count();
        const withCoach = await prisma.memoireProgress.count({ where: { accompagnateurId: { not: null } } });
        const completed = await prisma.memoireProgress.count({ where: { phase: 'FINAL' } });

        const [memoires, total] = await Promise.all([
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
            prisma.memoireProgress.count({ where })
        ]);

        // Get all coaches for filter dropdown
        const coaches = await prisma.user.findMany({
            where: { role: 'ACCOMPAGNATEUR' },
            select: { id: true, firstName: true, lastName: true },
            orderBy: { firstName: 'asc' }
        });

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

export default router;
