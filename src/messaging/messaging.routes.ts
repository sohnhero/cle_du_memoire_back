import { Router, Response } from 'express';
import prisma from '../prisma/client';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';

const router = Router();

// Messaging rules: who can message whom
function canMessage(senderRole: string, receiverRole: string): boolean {
    // Admin can message anyone
    if (senderRole === 'ADMIN') return true;
    // Student <-> Accompagnateur only
    if (senderRole === 'STUDENT' && receiverRole === 'ACCOMPAGNATEUR') return true;
    if (senderRole === 'STUDENT' && receiverRole === 'ADMIN') return true;
    if (senderRole === 'ACCOMPAGNATEUR' && receiverRole === 'STUDENT') return true;
    if (senderRole === 'ACCOMPAGNATEUR' && receiverRole === 'ADMIN') return true;
    // Forbidden: Student <-> Student, Accompagnateur <-> Accompagnateur
    return false;
}

// Get eligible partners to start a conversation with
router.get('/partners', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        let partners: any[] = [];

        if (user.role === 'ADMIN') {
            // Admin can see everyone except themselves
            partners = await prisma.user.findMany({
                where: { id: { not: user.id } },
                select: { id: true, firstName: true, lastName: true, role: true, avatar: true }
            });
        } else if (user.role === 'STUDENT') {
            // Student can see Admins + their assigned Accompagnateur
            const admins = await prisma.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true, firstName: true, lastName: true, role: true, avatar: true }
            });

            const memoire = await prisma.memoireProgress.findFirst({
                where: { studentId: user.id },
                include: { accompagnateur: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } } }
            });

            partners = [...admins];
            if (memoire?.accompagnateur) {
                partners.push(memoire.accompagnateur);
            }
        } else if (user.role === 'ACCOMPAGNATEUR') {
            // Accompagnateur can see Admins + their assigned Students
            const admins = await prisma.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true, firstName: true, lastName: true, role: true, avatar: true }
            });

            const memoires = await prisma.memoireProgress.findMany({
                where: { accompagnateurId: user.id },
                include: { student: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } } }
            });

            partners = [...admins, ...memoires.map(m => m.student)];
        }

        // Remove duplicates or nulls
        const uniquePartners = Array.from(new Map(partners.filter(p => !!p).map(p => [p.id, p])).values());

        res.json({ partners: uniquePartners });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get conversations
router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const userRole = req.user!.role;
        const conversations = await prisma.conversation.findMany({
            where: {
                OR: [{ participant1Id: userId }, { participant2Id: userId }],
            },
            include: {
                participant1: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
                participant2: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
            orderBy: { lastMessageAt: 'desc' },
        });

        // Get current coach assignments for the user
        let currentCoachId: string | null = null;
        let assignedStudentIds: string[] = [];

        if (userRole === 'STUDENT') {
            const memoire = await prisma.memoireProgress.findFirst({
                where: { studentId: userId },
                orderBy: { createdAt: 'desc' },
                select: { accompagnateurId: true },
            });
            currentCoachId = memoire?.accompagnateurId || null;
        } else if (userRole === 'ACCOMPAGNATEUR') {
            const memoires = await prisma.memoireProgress.findMany({
                where: { accompagnateurId: userId },
                select: { studentId: true },
            });
            assignedStudentIds = memoires.map(m => m.studentId);
        }

        // Count unread messages per conversation + add isActiveCoach flag
        const convWithMeta = await Promise.all(
            conversations.map(async (conv) => {
                const unreadCount = await prisma.message.count({
                    where: { conversationId: conv.id, senderId: { not: userId }, isRead: false },
                });

                // Determine isActiveCoach
                const otherId = conv.participant1Id === userId ? conv.participant2Id : conv.participant1Id;
                const other = conv.participant1Id === userId ? conv.participant2 : conv.participant1;
                let isActiveCoach = true; // default: messaging is allowed

                if (userRole === 'STUDENT' && other.role === 'ACCOMPAGNATEUR') {
                    isActiveCoach = currentCoachId === otherId;
                } else if (userRole === 'ACCOMPAGNATEUR' && other.role === 'STUDENT') {
                    isActiveCoach = assignedStudentIds.includes(otherId);
                }

                return { ...conv, unreadCount, isActiveCoach };
            })
        );

        res.json({ conversations: convWithMeta });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get messages of a conversation
router.get('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        // Verify participant
        const conversation = await prisma.conversation.findFirst({
            where: { id, OR: [{ participant1Id: userId }, { participant2Id: userId }] },
        });
        if (!conversation) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }

        // Mark all as read
        await prisma.message.updateMany({
            where: { conversationId: id, senderId: { not: userId }, isRead: false },
            data: { isRead: true },
        });

        const messages = await prisma.message.findMany({
            where: { conversationId: id },
            include: { sender: { select: { id: true, firstName: true, lastName: true, role: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });

        res.json({ messages });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

import multer from 'multer';
import { uploadToCloudinary } from '../common/services/cloudinary.service';
const upload = multer();

// Send a message
router.post('/send', authenticate, upload.single('attachment'), async (req: AuthRequest, res: Response) => {
    try {
        const { receiverId, content } = req.body;
        const senderId = req.user!.id;
        const file = req.file;

        if (!receiverId || (!content && !file)) {
            return res.status(400).json({ error: 'Destinataire et contenu ou pièce jointe requis' });
        }

        // Get receiver
        const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
        if (!receiver) {
            return res.status(404).json({ error: 'Destinataire introuvable' });
        }

        // Check messaging rules
        if (!canMessage(req.user!.role, receiver.role)) {
            return res.status(403).json({ error: 'Vous ne pouvez pas envoyer de message à cet utilisateur' });
        }

        // If student -> accompagnateur, ensure this is the currently assigned coach
        if (req.user!.role === 'STUDENT' && receiver.role === 'ACCOMPAGNATEUR') {
            const memoire = await prisma.memoireProgress.findFirst({
                where: { studentId: senderId },
                orderBy: { createdAt: 'desc' },
                select: { accompagnateurId: true },
            });
            if (!memoire || memoire.accompagnateurId !== receiverId) {
                return res.status(403).json({ error: 'Cet accompagnateur ne vous est plus assigné.' });
            }
        }

        // If accompagnateur -> student, ensure this student is currently assigned to them
        if (req.user!.role === 'ACCOMPAGNATEUR' && receiver.role === 'STUDENT') {
            const memoire = await prisma.memoireProgress.findFirst({
                where: { studentId: receiverId, accompagnateurId: senderId },
            });
            if (!memoire) {
                return res.status(403).json({ error: 'Cet étudiant ne vous est plus assigné.' });
            }
        }

        // Handle attachment upload
        let attachmentUrl = null;
        let attachmentType = null;

        if (file) {
            const uploadResult = await uploadToCloudinary(file.buffer, 'cle_du_memoire/messages', file.originalname);
            attachmentUrl = uploadResult.secure_url;
            attachmentType = file.mimetype.startsWith('image/') ? 'IMAGE' : file.mimetype === 'application/pdf' ? 'PDF' : 'DOCUMENT';
        }

        // Find or create conversation
        let conversation = await prisma.conversation.findFirst({
            where: {
                OR: [
                    { participant1Id: senderId, participant2Id: receiverId },
                    { participant1Id: receiverId, participant2Id: senderId },
                ],
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { participant1Id: senderId, participant2Id: receiverId },
            });
        }

        // Create message
        const message = await prisma.message.create({
            data: {
                conversationId: conversation.id,
                senderId,
                content: content || '',
                attachmentUrl,
                attachmentType,
            },
            include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
        });

        // Update conversation timestamp
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
        });

        // Create notification
        await prisma.notification.create({
            data: {
                userId: receiverId,
                title: 'Nouveau message',
                content: `${req.user!.role === 'STUDENT' ? 'Étudiant' : req.user!.role === 'ACCOMPAGNATEUR' ? 'Accompagnateur' : 'Admin'} vous a envoyé un message`,
                type: 'message',
            },
        });

        res.status(201).json({ message });
    } catch {
        res.status(500).json({ error: 'Erreur lors de l\'envoi' });
    }
});

export default router;
