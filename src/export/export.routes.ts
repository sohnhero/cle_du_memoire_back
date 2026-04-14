import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';
import PDFDocument from 'pdfkit';
import prisma from '../prisma/client';
import { generateWord } from './word-exporter';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { title, subtitle, university, faculty, academicYear, content, logo, design, format = 'pdf' } = req.body;

        const finalDesign = design || {
            themeColor: '#0F172A',
            hasBorder: true,
            pageNumberPosition: 'center',
            titleAlignment: 'center'
        };

        const studentId = req.user!.id;

        // Fetch user and optionally their accompagnateur from latest progress
        const student = await prisma.user.findUnique({
            where: { id: studentId }
        });

        const latestMemoire = await prisma.memoireProgress.findFirst({
            where: { studentId },
            include: { accompagnateur: true },
            orderBy: { createdAt: 'desc' }
        });

        if (!student) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        if (!title || !content) {
            return res.status(400).json({ error: 'Titre et contenu requis' });
        }

        const authorName = `${student.firstName} ${student.lastName}`;
        const directorName = latestMemoire?.accompagnateur
            ? `${latestMemoire.accompagnateur.firstName} ${latestMemoire.accompagnateur.lastName}`
            : '____________________';

        // ==========================================
        //         WORD EXPORT
        // ==========================================
        if (format === 'word') {
            const buffer = await generateWord({
                title, subtitle, university, faculty, academicYear, content, logo,
                design: finalDesign,
                authorName,
                directorName
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="Memoire_${student.lastName.replace(/\s+/g, '_')}.docx"`);
            return res.send(buffer);
        }

        // ==========================================
        //         PDF EXPORT (DEFAULT)
        // ==========================================
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            autoFirstPage: false
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Memoire_${student.lastName.replace(/\s+/g, '_')}.pdf"`);

        doc.pipe(res);

        // --- COVER PAGE ---
        doc.addPage();
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        if (finalDesign.hasBorder) {
            doc.rect(20, 20, pageWidth - 40, pageHeight - 40).lineWidth(2).stroke(finalDesign.themeColor);
        }

        doc.fillColor('#000000');
        let currentY = 70;

        if (logo && logo.startsWith('data:image')) {
            try {
                const base64Data = logo.split(',')[1];
                const imageBuffer = Buffer.from(base64Data, 'base64');
                doc.image(imageBuffer, pageWidth / 2 - 40, currentY - 20, { width: 80 });
                currentY += 80;
            } catch (e) {
                console.error("Failed to parse logo base64", e);
            }
        }

        doc.y = currentY;
        doc.fontSize(16).font('Helvetica-Bold').text((university || student.university || 'UNIVERSITÉ').toUpperCase(), { align: 'center', characterSpacing: 2 });

        if (faculty) {
            doc.moveDown(0.5);
            doc.fontSize(14).font('Helvetica').text(faculty.toUpperCase(), { align: 'center', characterSpacing: 1 });
        }

        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica-Oblique').text('Département de formation professionnelle', { align: 'center' });

        const middleY = pageHeight / 2 - 100;
        doc.y = middleY;
        doc.fillColor(finalDesign.themeColor).fontSize(14).font('Helvetica').text('MÉMOIRE DE FIN D\'ÉTUDES', { align: 'center', characterSpacing: 4 });
        doc.moveDown(2);
        doc.fontSize(22).font('Helvetica-Bold').text(title.toUpperCase(), { align: 'center' });

        if (subtitle) {
            doc.moveDown(1);
            doc.fontSize(16).font('Helvetica-Oblique').text(subtitle, { align: 'center' });
        }

        doc.fillColor('#000000');
        const lowerMiddleY = pageHeight - 250;
        const leftColX = 70;
        const rightColX = pageWidth / 2 + 30;

        doc.fontSize(12).font('Helvetica-Oblique');
        doc.text('Présenté et soutenu par :', leftColX, lowerMiddleY);
        doc.text('Sous la direction de :', rightColX, lowerMiddleY);

        const nameY = lowerMiddleY + 20;
        doc.font('Helvetica-Bold').fontSize(14);
        doc.text(authorName.toUpperCase(), leftColX, nameY, { width: 180 });
        doc.text(directorName.toUpperCase(), rightColX, nameY, { width: 180 });

        doc.y = pageHeight - 100;
        doc.fontSize(12).font('Helvetica').text(`Année Académique : ${academicYear || new Date().getFullYear()}`, 50, doc.y, { align: 'center', width: pageWidth - 100 });

        // --- CONTENT PAGES ---
        doc.addPage();
        const plainTextContent = content.replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n\n');
        const sections = plainTextContent.split(/(?=INTRODUCTION\n|DÉVELOPPEMENT\n|CONCLUSION\n)/g);

        for (const section of sections) {
            const trimmed = section.trim();
            if (!trimmed) continue;

            let sectionTitle = '';
            let sectionText = trimmed;

            if (trimmed.startsWith('INTRODUCTION')) {
                sectionTitle = 'INTRODUCTION';
                sectionText = trimmed.replace('INTRODUCTION', '').trim();
            } else if (trimmed.startsWith('DÉVELOPPEMENT')) {
                sectionTitle = 'DÉVELOPPEMENT';
                sectionText = trimmed.replace('DÉVELOPPEMENT', '').trim();
            } else if (trimmed.startsWith('CONCLUSION')) {
                sectionTitle = 'CONCLUSION';
                sectionText = trimmed.replace('CONCLUSION', '').trim();
            }

            if (sectionTitle) {
                doc.fontSize(18).fillColor(finalDesign.themeColor).font('Helvetica-Bold').text(sectionTitle, { align: finalDesign.titleAlignment });
                doc.moveDown(1).fillColor('#000000');
            }

            doc.fontSize(12).font('Times-Roman').text(sectionText, { align: 'justify', columns: 1, lineGap: 4, paragraphGap: 10 });
            doc.moveDown(2);
        }

        // --- PAGINATION ---
        const pages = doc.bufferedPageRange();
        for (let i = 1; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(10).font('Helvetica').fillColor('#000000').text(`${i}`,
                finalDesign.pageNumberPosition === 'right' ? pageWidth - 50 : 0,
                pageHeight - 40,
                { align: finalDesign.pageNumberPosition === 'right' ? 'right' : 'center', width: finalDesign.pageNumberPosition === 'right' ? undefined : pageWidth }
            );
        }

        doc.end();

    } catch (error) {
        console.error('Erreur export:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur lors de la génération du document' });
        }
    }
});

export default router;
