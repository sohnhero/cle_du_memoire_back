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
        const logs = await prisma.activityLog.findMany({
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
        });
        const total = await prisma.activityLog.count();
        res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// All subscriptions (Admin)
router.get('/subscriptions', authenticate, authorize('ADMIN'), async (_req: AuthRequest, res: Response) => {
    try {
        const subscriptions = await prisma.subscription.findMany({
            include: {
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                pack: true,
                payments: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ subscriptions });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
