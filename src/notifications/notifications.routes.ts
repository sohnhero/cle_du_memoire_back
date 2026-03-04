import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get my notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const unreadOnly = req.query.unread === 'true';

        const where: any = { userId: req.user!.id };
        if (unreadOnly) {
            where.isRead = false;
        }

        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.notification.count({ where })
        ]);

        res.json({
            notifications,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Mark one notification as read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const notification = await prisma.notification.update({
            where: { id, userId: req.user!.id },
            data: { isRead: true },
        });
        res.json({ notification });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Mark all notifications as read
router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user!.id, isRead: false },
            data: { isRead: true },
        });
        res.json({ message: 'Toutes les notifications ont été marquées comme lues' });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get unread count
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const count = await prisma.notification.count({
            where: { userId: req.user!.id, isRead: false },
        });
        res.json({ count });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;
