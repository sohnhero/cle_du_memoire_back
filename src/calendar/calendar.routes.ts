import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get calendar events
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const events = await prisma.event.findMany({
            where: { userId: req.user!.id },
            orderBy: { date: 'asc' },
        });
        res.json({ events });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get next upcoming event
router.get('/next', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const nextEvent = await prisma.event.findFirst({
            where: {
                userId: req.user!.id,
                isCompleted: false,
                date: { gte: new Date() }
            },
            orderBy: { date: 'asc' },
        });
        res.json({ event: nextEvent });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Create event
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, date, type } = req.body;
        const newEvent = await prisma.event.create({
            data: {
                userId: req.user!.id,
                title,
                description,
                date: new Date(date),
                type: type || 'REMINDER',
            }
        });
        res.status(201).json({ event: newEvent });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la création' });
    }
});

// Delete event
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        await prisma.event.delete({
            where: { id: req.params.id, userId: req.user!.id },
        });
        res.json({ message: 'Événement supprimé' });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// Toggle completion status
router.patch('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const event = await prisma.event.findUnique({
            where: { id: req.params.id, userId: req.user!.id },
        });

        if (!event) {
            return res.status(404).json({ error: 'Événement non trouvé' });
        }

        const updatedEvent = await prisma.event.update({
            where: { id: req.params.id },
            data: { isCompleted: !event.isCompleted },
        });

        res.json({ event: updatedEvent });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

export default router;
