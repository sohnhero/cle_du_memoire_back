import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, authorize, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Get my documents
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const where = req.user!.role === 'ADMIN'
            ? {}
            : req.user!.role === 'ACCOMPAGNATEUR'
                ? { memoire: { accompagnateurId: req.user!.id } }
                : { uploaderId: req.user!.id };

        const documents = await prisma.document.findMany({
            where,
            include: {
                uploader: { select: { id: true, firstName: true, lastName: true, role: true } },
                memoire: { select: { id: true, title: true, phase: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ documents });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

import multer from 'multer';
import { uploadToCloudinary } from '../common/services/cloudinary.service';
const upload = multer();

// Upload document (Student)
router.post('/upload', authenticate, authorize('STUDENT'), upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        const { memoireId } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        // Auto-resolve memoire if not provided
        let targetMemoireId = memoireId;
        if (!targetMemoireId) {
            const activeMemoire = await prisma.memoireProgress.findFirst({
                where: { studentId: req.user!.id },
                orderBy: { createdAt: 'desc' },
            });
            if (activeMemoire) {
                targetMemoireId = activeMemoire.id;
            }
        }

        // Calculate version based on existing documents in the same category for this user
        const lastDoc = await prisma.document.findFirst({
            where: {
                uploaderId: req.user!.id,
                category: req.body.category || 'GENERAL'
            },
            orderBy: { version: 'desc' },
        });

        const nextVersion = lastDoc ? lastDoc.version + 1 : 1;

        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(file.buffer, 'cle_du_memoire/documents', file.originalname);

        const document = await prisma.document.create({
            data: {
                uploaderId: req.user!.id,
                memoireId: targetMemoireId || null,
                filename: file.originalname,
                filePath: uploadResult.secure_url,
                mimeType: file.mimetype,
                fileSize: file.size,
                status: 'UPLOADED',
                category: req.body.category || 'GENERAL',
                version: nextVersion,
            },
        });
        res.status(201).json({ document });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erreur lors de l'upload" });
    }
});

// Review document (Accompagnateur/Admin)
router.patch('/:id/review', authenticate, authorize('ACCOMPAGNATEUR', 'ADMIN'), async (req, res: Response) => {
    try {
        const { id } = req.params;
        const { status, feedback } = req.body;
        const document = await prisma.document.update({
            where: { id },
            data: { status, feedback },
            include: { uploader: { select: { id: true, firstName: true, lastName: true } } },
        });
        res.json({ document });
    } catch {
        res.status(500).json({ error: 'Erreur lors de la revue' });
    }
});

export default router;
