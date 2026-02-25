import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, authorize, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get all users (Admin only)
router.get('/', authenticate, authorize('ADMIN'), async (_req: AuthRequest, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                isActive: true, createdAt: true, updatedAt: true,
                memoiresAsStudent: {
                    select: {
                        accompagnateur: {
                            select: { id: true, firstName: true, lastName: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ users });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get user profile
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                avatar: true, isActive: true, createdAt: true,
            },
        });
        res.json({ user });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Update user (Admin)
router.patch('/:id', authenticate, authorize('ADMIN'), async (req, res: Response) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, role, university, field, isActive } = req.body;
        const user = await prisma.user.update({
            where: { id },
            data: { firstName, lastName, phone, role, university, field, isActive },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                isActive: true, createdAt: true, updatedAt: true,
            },
        });
        res.json({ user });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Assign an accompanateur to a student
router.post('/:id/assign-coach', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params; // student ID
        const { coachId } = req.body;

        const coach = await prisma.user.findUnique({ where: { id: coachId } });
        if (!coach || coach.role !== 'ACCOMPAGNATEUR') {
            return res.status(400).json({ error: 'Coach invalide' });
        }

        const student = await prisma.user.findUnique({ where: { id } });
        if (!student || student.role !== 'STUDENT') {
            return res.status(400).json({ error: 'Étudiant invalide' });
        }

        let memoire = await prisma.memoireProgress.findFirst({
            where: { studentId: id },
            orderBy: { createdAt: 'desc' }
        });

        if (memoire) {
            memoire = await prisma.memoireProgress.update({
                where: { id: memoire.id },
                data: { accompagnateurId: coachId }
            });
        } else {
            memoire = await prisma.memoireProgress.create({
                data: {
                    studentId: id,
                    accompagnateurId: coachId,
                    title: "Mon Sujet de Mémoire",
                    phase: "TOPIC",
                    progressPercent: 0,
                }
            });
        }

        res.json({ message: 'Coach assigné avec succès', memoire });
    } catch {
        res.status(500).json({ error: 'Erreur lors de l\'assignation' });
    }
});

// Update own profile
router.patch('/me/profile', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { firstName, lastName, phone, university, field } = req.body;
        const user = await prisma.user.update({
            where: { id: req.user!.id },
            data: { firstName, lastName, phone, university, field },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                avatar: true, createdAt: true,
            },
        });
        res.json({ user });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Update avatar
router.patch('/me/avatar', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { avatar } = req.body;
        if (!avatar) {
            return res.status(400).json({ error: 'Avatar manquant' });
        }

        const user = await prisma.user.update({
            where: { id: req.user!.id },
            data: { avatar },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                avatar: true, createdAt: true,
            },
        });
        res.json({ user });
    } catch {
        res.status(500).json({ error: "Erreur lors de la mise à jour de l'avatar" });
    }
});

export default router;
