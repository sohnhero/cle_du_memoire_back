import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Register
router.post('/register', async (req, res: Response) => {
    try {
        const { email, password, firstName, lastName, phone, role, university, field, packId } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Champs obligatoires manquants' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const validRole = role === 'ACCOMPAGNATEUR' ? 'ACCOMPAGNATEUR' : 'STUDENT';

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                phone: phone || null,
                role: validRole,
                university: university || null,
                field: field || null,
                // Create student memoire progress entry automatically
                ...(validRole === 'STUDENT' ? {
                    memoiresAsStudent: {
                        create: {
                            title: `Mémoire de ${firstName} ${lastName}`,
                        }
                    },
                    // Create pending subscription if packId provided
                    ...(packId ? {
                        subscriptions: {
                            create: {
                                packId,
                                status: 'PENDING',
                                amountPaid: 0
                            }
                        }
                    } : {})
                } : {})
            },
        });

        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        await prisma.activityLog.create({
            data: { userId: user.id, action: 'REGISTER', details: `New ${validRole} registered` },
        });

        res.status(201).json({
            user: sanitizeUser(user),
            token,
            refreshToken,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Erreur lors de l\'inscription' });
    }
});

// Login
router.post('/login', async (req, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email et mot de passe requis' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: 'Compte désactivé' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        await prisma.activityLog.create({
            data: { userId: user.id, action: 'LOGIN', details: 'User logged in', ip: req.ip },
        });

        res.json({
            user: sanitizeUser(user),
            token,
            refreshToken,
        });
    } catch (error: any) {
        res.status(500).json({ error: 'Erreur lors de la connexion' });
    }
});

// Refresh Token
router.post('/refresh', async (req, res: Response) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token requis' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh-secret') as any;
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Token invalide' });
        }

        const newToken = generateToken(user);
        const newRefreshToken = generateRefreshToken(user);

        res.json({ token: newToken, refreshToken: newRefreshToken });
    } catch {
        res.status(401).json({ error: 'Refresh token expiré ou invalide' });
    }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        res.json({ user: sanitizeUser(user) });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Change password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Le mot de passe doit avoir au moins 6 caractères' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

        res.json({ message: 'Mot de passe mis à jour avec succès' });
    } catch {
        res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
    }
});

// Helpers
function generateToken(user: any) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
    );
}

function generateRefreshToken(user: any) {
    return jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET || 'refresh-secret',
        { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
    );
}

function sanitizeUser(user: any) {
    const { password, ...safeUser } = user;
    return safeUser;
}

export default router;
