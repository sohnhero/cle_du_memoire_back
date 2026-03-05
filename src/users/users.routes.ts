import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, authorize, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get all users (Admin only)
router.get('/', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const { role, search, isActive } = req.query;

        const where: any = {};
        if (role && role !== 'ALL') {
            where.role = role;
        }
        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }
        if (search) {
            where.OR = [
                { firstName: { contains: String(search), mode: 'insensitive' } },
                { lastName: { contains: String(search), mode: 'insensitive' } },
                { email: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true, email: true, firstName: true, lastName: true,
                    phone: true, role: true, university: true, field: true,
                    studyLevel: true, targetDefenseDate: true,
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
            }),
            prisma.user.count({ where })
        ]);

        res.json({
            users,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Create user (Admin only)
router.post('/', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { email, password, firstName, lastName, phone, role, university, field, studyLevel, targetDefenseDate } = req.body;

        if (!email || !password || !firstName || !lastName || !role) {
            return res.status(400).json({ error: 'Champs obligatoires manquants' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }

        const importBcrypt = await import('bcryptjs');
        const hashedPassword = await importBcrypt.default.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                phone: phone || null,
                role,
                university: university || null,
                field: field || null,
                studyLevel: studyLevel || null,
                targetDefenseDate: targetDefenseDate ? new Date(targetDefenseDate) : null,
                isActive: true, // Admin-created users are active by default
                // Create student memoire progress entry automatically
                ...(role === 'STUDENT' ? {
                    memoiresAsStudent: {
                        create: {
                            title: `Mémoire de ${firstName} ${lastName}`,
                        }
                    }
                } : {})
            },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                studyLevel: true, targetDefenseDate: true,
                isActive: true, createdAt: true
            }
        });

        res.status(201).json({ user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
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
                studyLevel: true, targetDefenseDate: true,
                avatar: true, isActive: true, createdAt: true,
            },
        });
        res.json({ user });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get single user by ID (Admin only)
router.get('/:id', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                studyLevel: true, targetDefenseDate: true,
                avatar: true, isActive: true, createdAt: true, updatedAt: true,
                memoiresAsStudent: {
                    select: {
                        id: true, title: true, phase: true, progressPercent: true, notes: true, createdAt: true,
                        accompagnateur: { select: { id: true, firstName: true, lastName: true, email: true } },
                        documents: {
                            select: { id: true, filename: true, status: true, category: true, createdAt: true },
                            orderBy: { createdAt: 'desc' },
                            take: 10,
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
                subscriptions: {
                    select: {
                        id: true, status: true, amountPaid: true, activatedAt: true, createdAt: true,
                        pack: { select: { id: true, name: true, price: true, description: true } },
                        payments: { select: { id: true, amount: true, status: true, method: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
        res.json({ user });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Update user (Admin)
router.patch('/:id', authenticate, authorize('ADMIN'), async (req, res: Response) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, role, university, field, studyLevel, targetDefenseDate, isActive } = req.body;
        const user = await prisma.user.update({
            where: { id },
            data: { firstName, lastName, phone, role, university, field, studyLevel, targetDefenseDate: targetDefenseDate ? new Date(targetDefenseDate) : null, isActive },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                studyLevel: true, targetDefenseDate: true,
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
        import('fs').then(fs => fs.appendFileSync('/tmp/cdm_profile.log', JSON.stringify({ body: req.body, user: req.user!.id }) + '\\n')).catch(() => { });
        const { firstName, lastName, phone, university, field, studyLevel, targetDefenseDate } = req.body;

        const user = await prisma.user.update({
            where: { id: req.user!.id },
            data: { firstName, lastName, phone, university, field, studyLevel, targetDefenseDate: targetDefenseDate ? new Date(targetDefenseDate) : null },
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                studyLevel: true, targetDefenseDate: true,
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
                studyLevel: true, targetDefenseDate: true,
                avatar: true, createdAt: true,
            },
        });
        res.json({ user });
    } catch {
        res.status(500).json({ error: "Erreur lors de la mise à jour de l'avatar" });
    }
});

export default router;
