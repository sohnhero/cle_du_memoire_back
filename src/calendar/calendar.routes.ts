import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get calendar events (own events + meetings assigned to student)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Personal events (created by user)
        const ownEvents = await prisma.event.findMany({
            where: { userId },
            include: {
                student: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            },
            orderBy: { date: 'asc' },
        });

        // For students: also get meetings where they are the student
        let assignedMeetings: any[] = [];
        if (req.user!.role === 'STUDENT') {
            assignedMeetings = await prisma.event.findMany({
                where: {
                    studentId: userId,
                    userId: { not: userId }, // not their own event
                },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                },
                orderBy: { date: 'asc' },
            });
            // Tag assigned meetings so frontend knows they came from coach
            assignedMeetings = assignedMeetings.map(m => ({
                ...m,
                isFromCoach: true,
                coachName: `${m.user.firstName} ${m.user.lastName}`,
            }));
        }

        const events = [...ownEvents, ...assignedMeetings].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        res.json({ events });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get next upcoming event
router.get('/next', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Check own events
        const ownNext = await prisma.event.findFirst({
            where: {
                userId,
                isCompleted: false,
                date: { gte: new Date() }
            },
            orderBy: { date: 'asc' },
        });

        // For students, also check assigned meetings
        let assignedNext = null;
        if (req.user!.role === 'STUDENT') {
            assignedNext = await prisma.event.findFirst({
                where: {
                    studentId: userId,
                    userId: { not: userId },
                    isCompleted: false,
                    date: { gte: new Date() }
                },
                include: {
                    user: { select: { firstName: true, lastName: true } },
                },
                orderBy: { date: 'asc' },
            });
        }

        // Return whichever is sooner
        let nextEvent = ownNext;
        if (assignedNext && (!ownNext || new Date(assignedNext.date) < new Date(ownNext.date))) {
            nextEvent = { ...assignedNext, isFromCoach: true, coachName: `${assignedNext.user.firstName} ${assignedNext.user.lastName}` } as any;
        }

        res.json({ event: nextEvent });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get coach's assigned students
router.get('/students', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        if (req.user!.role !== 'ACCOMPAGNATEUR' && req.user!.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        const memoires = await prisma.memoireProgress.findMany({
            where: { accompagnateurId: req.user!.id },
            include: {
                student: {
                    select: { id: true, firstName: true, lastName: true, avatar: true, email: true },
                },
            },
        });

        const students = memoires
            .map(m => m.student)
            .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i); // deduplicate

        res.json({ students });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Create event (with optional meeting scheduling)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, date, type, studentId } = req.body;

        // Auto-generate Jitsi meeting link for MEETING type
        let meetingLink: string | null = null;
        if (type === 'MEETING') {
            const roomId = `cle-du-memoire-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            meetingLink = `https://meet.jit.si/${roomId}`;
        }

        const newEvent = await prisma.event.create({
            data: {
                userId: req.user!.id,
                title,
                description,
                date: new Date(date),
                type: type || 'REMINDER',
                studentId: type === 'MEETING' ? studentId : null,
                meetingLink,
            },
            include: {
                student: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            },
        });

        // Auto-create notification for the student if it's a meeting
        if (type === 'MEETING' && studentId) {
            const meetingDate = new Date(date);
            const formattedDate = meetingDate.toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
            });
            const formattedTime = meetingDate.toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit',
            });

            await prisma.notification.create({
                data: {
                    userId: studentId,
                    title: '📅 Séance planifiée',
                    content: `Votre accompagnateur a planifié une séance le ${formattedDate} à ${formattedTime}. ${title}`,
                    type: 'meeting',
                },
            });
        }

        res.status(201).json({ event: newEvent });
    } catch (err) {
        console.error(err);
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

// Update event details
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, date, type, studentId } = req.body;

        let meetingLink = undefined;
        if (type === 'MEETING') {
            const event = await prisma.event.findUnique({ where: { id: req.params.id } });
            if (event && !event.meetingLink) {
                const roomId = `cle-du-memoire-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                meetingLink = `https://meet.jit.si/${roomId}`;
            }
        }

        const updatedEvent = await prisma.event.update({
            where: { id: req.params.id, userId: req.user!.id },
            data: {
                title,
                description,
                date: date ? new Date(date) : undefined,
                type: type || undefined,
                studentId: type === 'MEETING' ? studentId : null,
                meetingLink,
            },
            include: {
                student: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            },
        });

        res.json({ event: updatedEvent });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
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
