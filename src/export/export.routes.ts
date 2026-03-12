import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';
import PDFDocument from 'pdfkit';
import prisma from '../prisma/client';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { title, subtitle, university, faculty, academicYear, content, logo, design } = req.body;

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

        // Initialize PDF Document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            autoFirstPage: false // Manually add pages to control layout perfectly
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Memoire_${student.lastName.replace(/\s+/g, '_')}.pdf"`);

        // Pipe the PDF into the response
        doc.pipe(res);

        // ==========================================
        //         PAGE DE GARDE (COVER PAGE)
        // ==========================================
        doc.addPage();

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        // --- BORDER ---
        if (finalDesign.hasBorder) {
            doc.rect(20, 20, pageWidth - 40, pageHeight - 40)
                .lineWidth(2)
                .stroke(finalDesign.themeColor);
        }

        doc.fillColor('#000000'); // Default text color

        // --- UPPER SECTION (INSTITUTION & LOGO) ---
        let currentY = 70; // Start lower

        if (logo && logo.startsWith('data:image')) {
            try {
                const base64Data = logo.split(',')[1];
                const imageBuffer = Buffer.from(base64Data, 'base64');
                // Center the logo
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
        doc.fontSize(12).font('Helvetica-Oblique').text('Département de formation professionnelle', { align: 'center' }); // Example generic text

        // --- MIDDLE SECTION (TITLE) ---
        const middleY = pageHeight / 2 - 100;
        doc.y = middleY;

        doc.fillColor(finalDesign.themeColor).fontSize(14).font('Helvetica').text('MÉMOIRE DE FIN D\'ÉTUDES', { align: 'center', characterSpacing: 4 });
        doc.moveDown(2);

        doc.fontSize(22).font('Helvetica-Bold').text(title.toUpperCase(), { align: 'center' });

        if (subtitle) {
            doc.moveDown(1);
            doc.fontSize(16).font('Helvetica-Oblique').text(subtitle, { align: 'center' });
        }

        doc.fillColor('#000000'); // Reset to black for the rest

        // --- LOWER MIDDLE SECTION (PEOPLE) ---
        const lowerMiddleY = pageHeight - 250;

        // Define two columns
        const leftColX = 70;
        const rightColX = pageWidth / 2 + 30;

        doc.fontSize(12).font('Helvetica-Oblique');
        doc.text('Présenté et soutenu par :', leftColX, lowerMiddleY);
        doc.text('Sous la direction de :', rightColX, lowerMiddleY);

        const nameY = lowerMiddleY + 20; // Move down 20pt for the actual names

        doc.font('Helvetica-Bold').fontSize(14);

        // Author
        doc.text(`${student.firstName} ${student.lastName}`.toUpperCase(), leftColX, nameY, { width: 180 });

        // Director
        const directorName = latestMemoire?.accompagnateur
            ? `${latestMemoire.accompagnateur.firstName} ${latestMemoire.accompagnateur.lastName}`
            : '____________________';
        doc.text(directorName.toUpperCase(), rightColX, nameY, { width: 180 });

        // --- BOTTOM SECTION (YEAR) ---
        doc.y = pageHeight - 100;
        doc.fontSize(12).font('Helvetica').text(`Année Académique : ${academicYear || new Date().getFullYear()}`, 50, doc.y, { align: 'center', width: pageWidth - 100 });


        // ==========================================
        //         CONTENT PAGES
        // ==========================================
        doc.addPage();

        // Strip HTML tags simply just in case, but frontend currently sends plain text.
        const plainTextContent = content.replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n\n');

        // We split content by our hardcoded headers if they exist, or just print it.
        // In our frontend we injected INTRODUCTION, DÉVELOPPEMENT, CONCLUSION
        // This regex splits the text and keeps the delimiters before the parts
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
                doc.fontSize(18)
                    .fillColor(finalDesign.themeColor)
                    .font('Helvetica-Bold')
                    .text(sectionTitle, { align: finalDesign.titleAlignment });
                doc.moveDown(1).fillColor('#000000');
            }

            doc.fontSize(12)
                .font('Times-Roman') // Academic standard font for body
                .text(sectionText, {
                    align: 'justify',
                    columns: 1,
                    lineGap: 4, // 1.5 spacing equivalent roughly
                    paragraphGap: 10
                });

            doc.moveDown(2);
        }

        // ==========================================
        //         PAGINATION
        // ==========================================
        const pages = doc.bufferedPageRange();
        // Start from page index 1 to skip Cover Page (index 0)
        for (let i = 1; i < pages.count; i++) {
            doc.switchToPage(i);

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor('#000000')
                .text(`${i}`,
                    finalDesign.pageNumberPosition === 'right' ? pageWidth - 50 : 0,
                    pageHeight - 40,
                    { align: finalDesign.pageNumberPosition === 'right' ? 'right' : 'center', width: finalDesign.pageNumberPosition === 'right' ? undefined : pageWidth }
                );
        }

        // Finalize PDF file
        doc.end();

    } catch (error) {
        console.error('Erreur export PDF:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
        }
    }
});

export default router;
