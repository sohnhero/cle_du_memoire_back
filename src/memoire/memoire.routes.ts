import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get the current user's memoire progress
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;

        let memoire;
        if (user.role === 'STUDENT') {
            memoire = await prisma.memoireProgress.findFirst({
                where: { studentId: user.id },
                include: {
                    accompagnateur: {
                        select: { id: true, firstName: true, lastName: true }
                    }
                }
            });

            // Auto-create if none exists for the student (for demo purposes)
            if (!memoire) {
                memoire = await prisma.memoireProgress.create({
                    data: {
                        studentId: user.id,
                        title: "Mon Sujet de Mémoire",
                        phase: "TOPIC",
                        progressPercent: 0,
                    },
                    include: {
                        accompagnateur: {
                            select: { id: true, firstName: true, lastName: true }
                        }
                    }
                });
            }
        } else if (user.role === 'ACCOMPAGNATEUR') {
            // If accompagnateur requests without specific ID, return all their students' memoires
            const memoires = await prisma.memoireProgress.findMany({
                where: { accompagnateurId: user.id },
                include: {
                    student: {
                        select: { id: true, firstName: true, lastName: true, field: true, university: true }
                    }
                }
            });
            return res.json({ memoires });
        } else {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        res.json({ memoire });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Update memoire progress
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { title, phase, progressPercent, notes } = req.body;
        const user = req.user!;

        // Check ownership
        const existing = await prisma.memoireProgress.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Mémoire non trouvé' });
        }

        const isOwner = user.role === 'STUDENT' && existing.studentId === user.id;
        const isCoach = user.role === 'ACCOMPAGNATEUR' && existing.accompagnateurId === user.id;
        const isAdmin = user.role === 'ADMIN';

        if (!isOwner && !isCoach && !isAdmin) {
            return res.status(403).json({ error: 'Non autorisé' });
        }

        const memoire = await prisma.memoireProgress.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(phase && { phase }),
                ...(progressPercent !== undefined && { progressPercent }),
                ...(notes && { notes }),
            }
        });

        res.json({ memoire });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

export default router;
