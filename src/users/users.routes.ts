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
                    studyLevel: true, targetDefenseDate: true, avatar: true,
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

        const existingUserByEmail = await prisma.user.findUnique({ where: { email } });
        if (existingUserByEmail) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }

        if (phone) {
            const existingUserByPhone = await prisma.user.findFirst({ where: { phone } });
            if (existingUserByPhone) {
                return res.status(409).json({ error: 'Ce numéro de téléphone est déjà utilisé' });
            }
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
router.patch('/:id', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { email, firstName, lastName, phone, role, university, field, studyLevel, targetDefenseDate, isActive } = req.body;

        const updateData: any = { 
            email, firstName, lastName, phone, role, university, field, studyLevel, 
            targetDefenseDate: targetDefenseDate ? new Date(targetDefenseDate) : null, 
            isActive 
        };

        if (req.body.password) {
            const bcrypt = await import('bcryptjs');
            updateData.password = await bcrypt.default.hash(req.body.password, 12);
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true, email: true, firstName: true, lastName: true,
                phone: true, role: true, university: true, field: true,
                studyLevel: true, targetDefenseDate: true,
                isActive: true, createdAt: true, updatedAt: true,
            },
        });
        res.json({ user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de la mise à jour' });
    }
});

// Delete user (Admin only)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Ensure user is not deleting themselves
        if (req.user!.id === id) {
            return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        // The related records like ActivityLog, Document (if uploader), Events, Messages, 
        // Notifications, subscriptions, etc that have onDelete: Cascade will be deleted automatically.
        // Some relations like MemoireProgress (accompagnateurId) might not have cascade delete 
        // and could cause issues if we don't handle them. But let's rely on Prisma's cascade 
        // delete for the ones configured. For MemoireProgress studentId is cascade.

        // Actually from schema: 
        // MemoireProgress: student is Cascade. coach is nullified? No, it's not Cascade, so might throw if coach is assigned.
        // Let's clear the coach from memoires if the user being deleted is a coach.
        if (user.role === 'ACCOMPAGNATEUR') {
            await prisma.memoireProgress.updateMany({
                where: { accompagnateurId: id },
                data: { accompagnateurId: null }
            });
        }

        // Similarly for events where studentId is the user
        await prisma.event.deleteMany({
            where: { studentId: id }
        });

        // Finally delete the user
        await prisma.user.delete({
            where: { id }
        });

        res.json({ message: 'Utilisateur supprimé avec succès' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression de l\'utilisateur' });
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

// Change email
router.patch('/me/email', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { currentPassword, newEmail } = req.body;
        if (!currentPassword || !newEmail) {
            return res.status(400).json({ error: 'Mot de passe actuel et nouvel email requis' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const bcrypt = await import('bcryptjs');
        const valid = await bcrypt.default.compare(currentPassword, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        }

        // Check if email already taken
        const existing = await prisma.user.findUnique({ where: { email: newEmail } });
        if (existing) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre compte' });
        }

        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { email: newEmail },
            select: { id: true, email: true }
        });

        res.json({ message: 'Email mis à jour avec succès', email: updated.email });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors du changement d\'email' });
    }
});

export default router;
