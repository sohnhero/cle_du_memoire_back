import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';
import PDFDocument from 'pdfkit';
import prisma from '../prisma/client';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { title, content } = req.body;

        // Refetch user to get university info reliably
        const student = await prisma.user.findUnique({
            where: { id: req.user!.id }
        });

        if (!student) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        if (!title || !content) {
            return res.status(400).json({ error: 'Titre et contenu requis' });
        }

        // Initialize PDF Document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Memoire_${student.lastName.replace(/\s+/g, '_')}.pdf"`);

        // Pipe the PDF into the response
        doc.pipe(res);

        // Add Front Page
        doc.fontSize(24)
            .font('Helvetica-Bold')
            .text('Clé du Mémoire', { align: 'center' })
            .moveDown(2);

        doc.fontSize(20)
            .text(title, { align: 'center' })
            .moveDown(4);

        doc.fontSize(14)
            .font('Helvetica')
            .text(`Auteur : ${student.firstName} ${student.lastName}`, { align: 'center' })
            .moveDown(1);

        const university = student.university || 'Université';
        doc.text(`Institution : ${university}`, { align: 'center' })
            .moveDown(8);

        doc.fontSize(12)
            .text(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });

        doc.addPage();

        // Add Content
        // The content might be HTML from a rich text editor or plain text. 
        // We'll strip HTML tags just in case, using a simple regex since pdfkit doesn't natively parse HTML.
        const plainTextContent = content.replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n\n');

        doc.fontSize(12)
            .font('Helvetica')
            .text(plainTextContent, {
                align: 'justify',
                columns: 1,
                lineGap: 4
            });

        // Adding Page Numbers
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            // Footer: page number
            doc.fontSize(10)
                .text(`Page ${i + 1} / ${pages.count}`,
                    50,
                    doc.page.height - 50,
                    { align: 'center' }
                );
        }

        // Finalize PDF file
        doc.end();

    } catch (error) {
        console.error('Erreur export PDF:', error);
        // If headers weren't sent yet
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
        }
    }
});

export default router;
