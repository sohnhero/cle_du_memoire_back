import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../prisma/client';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token manquant ou invalide' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        req.user = { id: decoded.id, email: decoded.email, role: decoded.role };

        // Maintenance Mode Check
        if (req.user.role !== 'ADMIN') {
            const maintenanceSetting = await prisma.globalSetting.findUnique({
                where: { key: 'maintenanceMode' }
            });
            if (maintenanceSetting?.value === 'true') {
                return res.status(503).json({
                    error: 'Plateforme en maintenance',
                    message: 'La plateforme est temporairement inaccessible pour maintenance. Seuls les administrateurs peuvent se connecter.'
                });
            }
        }

        next();
    } catch {
        return res.status(401).json({ error: 'Token expiré ou invalide' });
    }
}

export function authorize(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        next();
    };
}
