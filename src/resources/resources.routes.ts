import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, authorize, AuthRequest } from '../common/guards/auth.guard';
import multer from 'multer';
import { uploadToCloudinary } from '../common/services/cloudinary.service';

const router = Router();
const upload = multer();

// Get resources
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { category } = req.query;
        const whereClause = category ? { category: String(category) } : {};

        const resources = await prisma.resource.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
        });
        res.json({ resources });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Admin ONLY: Create resource
router.post('/', authenticate, authorize('ADMIN'), upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, category, linkUrl } = req.body;
        const file = req.file;

        if (!title || (!file && !linkUrl)) {
            return res.status(400).json({ error: 'Titre et fichier (ou lien) requis' });
        }

        let fileUrl = linkUrl || '';
        let fileType = 'LINK';

        if (file) {
            const uploadResult = await uploadToCloudinary(file.buffer, 'cle_du_memoire/resources', file.originalname);
            fileUrl = uploadResult.secure_url;

            // Determine type
            if (file.mimetype === 'application/pdf') fileType = 'PDF';
            else if (file.mimetype.includes('word')) fileType = 'DOCX';
            else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) fileType = 'EXCEL';
            else fileType = 'OTHER';
        }

        const newResource = await prisma.resource.create({
            data: {
                title,
                description,
                category: category || 'GENERAL',
                fileUrl,
                fileType,
            }
        });

        res.status(201).json({ resource: newResource });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur création ressource' });
    }
});

// Admin ONLY: Delete resource
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
    try {
        await prisma.resource.delete({ where: { id: req.params.id } });
        res.json({ message: 'Ressource supprimée' });
    } catch {
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

export default router;
