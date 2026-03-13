import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import { sendWelcomeEmail, sendNewUserNotificationToAdmin, sendResetPasswordEmail } from '../common/mailer';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';
import crypto from 'crypto';

const router = Router();

// Register
router.post('/register', async (req, res: Response) => {
    try {
        const { email, password, firstName, lastName, phone, role, university, field, studyLevel, targetDefenseDate, packId } = req.body;

        // Registration Control Check (including Maintenance Mode)
        const [regSetting, maintSetting] = await Promise.all([
            prisma.globalSetting.findUnique({ where: { key: 'allowRegistrations' } }),
            prisma.globalSetting.findUnique({ where: { key: 'maintenanceMode' } })
        ]);

        if (regSetting?.value === 'false' || maintSetting?.value === 'true') {
            const reason = maintSetting?.value === 'true' ? 'Plateforme en maintenance' : 'Inscriptions fermées';
            return res.status(403).json({
                error: reason,
                message: maintSetting?.value === 'true'
                    ? 'Les inscriptions sont suspendues pendant la maintenance.'
                    : 'Les inscriptions sont temporairement fermées sur la plateforme.'
            });
        }

        if (!email || !password || !firstName || !lastName || !studyLevel || !targetDefenseDate) {
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

        const hashedPassword = await bcrypt.hash(password, 12);
        const validRole = role === 'ACCOMPAGNATEUR' ? 'ACCOMPAGNATEUR' : 'STUDENT';
        const isActive = validRole !== 'ACCOMPAGNATEUR'; // Coaches start inactive

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
                studyLevel: studyLevel || null,
                targetDefenseDate: targetDefenseDate ? new Date(targetDefenseDate) : null,
                isActive,
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

        // Trigger emails asynchronously without blocking the response
        if (validRole === 'STUDENT') {
            sendWelcomeEmail(user);
            sendNewUserNotificationToAdmin(user);
        }

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
        const { email, password, rememberMe } = req.body;

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

        const token = generateToken(user, rememberMe);
        const refreshToken = generateRefreshToken(user, rememberMe);

        await prisma.activityLog.create({
            data: { userId: user.id, action: 'LOGIN', details: `User logged in ${rememberMe ? '(Remember Me)' : ''}`, ip: req.ip },
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

// Forgot Password
router.post('/forgot-password', async (req, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requis' });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Security: don't reveal if user exists, but here we usually just return success
            return res.json({ message: 'Si cet email correspond à un compte, un lien de réinitialisation vous a été envoyé.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken, resetTokenExpires }
        });

        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        await sendResetPasswordEmail(user, resetLink);

        res.json({ message: 'Si cet email correspond à un compte, un lien de réinitialisation vous a été envoyé.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Reset Password
router.post('/reset-password', async (req, res: Response) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });

        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpires: { gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Token invalide ou expiré' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpires: null
            }
        });

        res.json({ message: 'Votre mot de passe a été réinitialisé avec succès.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Helpers
function generateToken(user: any, rememberMe = false) {
    const expiresIn = rememberMe ? '30d' : (process.env.JWT_EXPIRES_IN || '1h');
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: expiresIn as any }
    );
}

function generateRefreshToken(user: any, rememberMe = false) {
    const expiresIn = rememberMe ? '90d' : (process.env.JWT_REFRESH_EXPIRES_IN || '7d');
    return jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET || 'refresh-secret',
        { expiresIn: expiresIn as any }
    );
}

function sanitizeUser(user: any) {
    const { password, ...safeUser } = user;
    return safeUser;
}

export default router;
