import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, authorize, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get all packs (public)
router.get('/', async (_req, res: Response) => {
    try {
        const packs = await prisma.pack.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
        });
        res.json({ packs });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Subscribe to a pack (Student)
router.post('/subscribe', authenticate, authorize('STUDENT'), async (req: AuthRequest, res: Response) => {
    try {
        const { packId } = req.body;
        const pack = await prisma.pack.findUnique({ where: { id: packId } });
        if (!pack || !pack.isActive) {
            return res.status(404).json({ error: 'Pack introuvable ou inactif' });
        }

        // Deactivate all other subscriptions for this user
        await prisma.subscription.updateMany({
            where: {
                userId: req.user!.id,
                status: { notIn: ['CANCELLED', 'EXPIRED', 'DEACTIVATED'] }
            },
            data: { status: 'DEACTIVATED' }
        });

        const subscription = await prisma.subscription.create({
            data: {
                userId: req.user!.id,
                packId,
                status: 'PENDING',
                amountPaid: 0,
            },
            include: { pack: true },
        });

        res.status(201).json({ subscription });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la souscription' });
    }
});

// Get my subscriptions (Student)
router.get('/my-subscriptions', authenticate, authorize('STUDENT'), async (req: AuthRequest, res: Response) => {
    try {
        const subscriptions = await prisma.subscription.findMany({
            where: { userId: req.user!.id },
            include: { pack: true, payments: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ subscriptions });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Activate a pack (Admin) - Deprecated by payment but kept
router.patch('/:id/activate', authenticate, authorize('ADMIN'), async (req, res: Response) => {
    try {
        const { id } = req.params;

        // Get user for this sub
        const subToActivate = await prisma.subscription.findUnique({ where: { id } });
        if (!subToActivate) return res.status(404).json({ error: 'Abonnement introuvable' });

        // Deactivate others
        await prisma.subscription.updateMany({
            where: {
                userId: subToActivate.userId,
                id: { not: id },
                status: { notIn: ['CANCELLED', 'EXPIRED', 'DEACTIVATED'] }
            },
            data: { status: 'DEACTIVATED' }
        });

        const subscription = await prisma.subscription.update({
            where: { id },
            data: { status: 'ACTIVE', activatedAt: new Date() },
            include: { pack: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        });
        res.json({ subscription });
    } catch {
        res.status(500).json({ error: 'Erreur lors de l\'activation' });
    }
});

// Admin: Record payment for a subscription
router.patch('/subscriptions/:id/payment', authenticate, authorize('ADMIN'), async (req, res: Response) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        const subscription = await prisma.subscription.findUnique({
            where: { id },
            include: { pack: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } }
        });

        if (!subscription) {
            return res.status(404).json({ error: 'Abonnement introuvable' });
        }

        const newAmountPaid = subscription.amountPaid + Number(amount);
        const packPrice = subscription.pack.price;

        let newStatus = subscription.status;
        let activatedAt = subscription.activatedAt;

        if (newAmountPaid >= packPrice) {
            newStatus = 'ACTIVE';
            activatedAt = new Date();

            // Enforce single active pack: Deactivate others when THIS one becomes ACTIVE
            await prisma.subscription.updateMany({
                where: {
                    userId: subscription.userId,
                    id: { not: id },
                    status: { notIn: ['CANCELLED', 'EXPIRED', 'DEACTIVATED'] }
                },
                data: { status: 'DEACTIVATED' }
            });
        } else if (newAmountPaid > 0 && newAmountPaid < packPrice) {
            newStatus = 'PARTIAL';
        }

        // Record the payment
        await prisma.payment.create({
            data: {
                subscriptionId: id,
                amount: Number(amount),
                status: 'CONFIRMED',
                method: 'MANUAL', // Or received over the counter/external transfer
            }
        });

        // Update subscription
        const updatedSub = await prisma.subscription.update({
            where: { id },
            data: {
                amountPaid: newAmountPaid,
                status: newStatus,
                activatedAt
            },
            include: { pack: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } }
        });

        res.json({ subscription: updatedSub });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement du paiement' });
    }
});

// Admin: Create/Update pack
router.post('/', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        const { name, description, price, installment1, installment2, features } = req.body;
        const pack = await prisma.pack.create({
            data: {
                name, description, price,
                installment1: installment1 || null,
                installment2: installment2 || null,
                features: JSON.stringify(features || []),
            },
        });
        res.status(201).json({ pack });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la création du pack' });
    }
});

// Student: Notify payment (WAVE/OM reference)
router.post('/pay', authenticate, authorize('STUDENT'), async (req: AuthRequest, res: Response) => {
    try {
        const { method, reference, amount } = req.body;

        // Find current subscription (PENDING or PARTIAL or DEACTIVATED if they want to reactivation)
        const subscription = await prisma.subscription.findFirst({
            where: {
                userId: req.user!.id,
                status: { in: ['PENDING', 'PARTIAL', 'DEACTIVATED'] }
            },
            include: { pack: true }
        });

        if (!subscription) {
            return res.status(404).json({ error: 'Aucun abonnement en attente trouvé' });
        }

        // Create a PENDING payment record
        await prisma.payment.create({
            data: {
                subscriptionId: subscription.id,
                amount: Number(amount),
                method,
                reference,
                status: 'PENDING',
            }
        });

        // Logic: if PENDING and they pay >= installment1, mark as PARTIAL
        // ONLY if the pack actually supports installments
        if (subscription.status === 'PENDING' &&
            subscription.pack.installment1 &&
            Number(amount) >= subscription.pack.installment1) {
            await prisma.subscription.update({
                where: { id: subscription.id },
                data: { status: 'PARTIAL', amountPaid: Number(amount) }
            });
        }

        res.json({ message: 'Notification de paiement envoyée. Un administrateur validera sous peu.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de la notification de paiement' });
    }
});

export default router;
