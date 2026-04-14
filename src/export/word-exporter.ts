import { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun, HeadingLevel, PageBorderDisplay, PageBorderOffsetFrom, PageBorderZOrder, BorderStyle } from 'docx';

export interface ExportData {
    title: string;
    subtitle?: string;
    university?: string;
    faculty?: string;
    academicYear?: string;
    content: string;
    logo?: string; // base64
    design: {
        themeColor: string;
        hasBorder: boolean;
        pageNumberPosition: 'center' | 'right';
        titleAlignment: 'center' | 'left';
    };
    authorName: string;
    directorName: string;
}

export async function generateWord(data: ExportData): Promise<Buffer> {
    const { title, subtitle, university, faculty, academicYear, content, logo, design, authorName, directorName } = data;

    const sections = [];

    // --- COVER PAGE ---
    const coverPageChildren = [];

    // Logo
    if (logo && logo.startsWith('data:image')) {
        try {
            const base64Data = logo.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            coverPageChildren.push(
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new ImageRun({
                            data: buffer,
                            transformation: { width: 80, height: 80 },
                        } as any),
                    ],
                    spacing: { after: 400 },
                })
            );
        } catch (e) {
            console.error("Word Export: Failed to parse logo", e);
        }
    }

    // University & Faculty
    coverPageChildren.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: (university || 'UNIVERSITÉ').toUpperCase(),
                    bold: true,
                    size: 32, // 16pt
                    color: design.themeColor,
                }),
            ],
        })
    );

    if (faculty) {
        coverPageChildren.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({
                        text: faculty.toUpperCase(),
                        size: 28, // 14pt
                    }),
                ],
            })
        );
    }

    coverPageChildren.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: 'Département de formation professionnelle',
                    italics: true,
                    size: 24,
                }),
            ],
            spacing: { after: 2000 }, // Large space before middle section
        })
    );

    // Title Section
    coverPageChildren.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: "MÉMOIRE DE FIN D'ÉTUDES",
                    color: design.themeColor,
                    size: 28,
                    bold: true,
                }),
            ],
        })
    );

    coverPageChildren.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: title.toUpperCase(),
                    bold: true,
                    size: 44, // 22pt
                }),
            ],
            spacing: { before: 400, after: 200 },
        })
    );

    if (subtitle) {
        coverPageChildren.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({
                        text: subtitle,
                        italics: true,
                        size: 32,
                    }),
                ],
                spacing: { after: 1500 },
            })
        );
    } else {
        coverPageChildren.push(new Paragraph({ spacing: { after: 1500 } }));
    }

    // People Section
    coverPageChildren.push(
        new Paragraph({
            children: [
                new TextRun({ text: "Présenté et soutenu par :", italics: true, size: 24 }),
                new TextRun({ text: "\t\t\t\t\tSous la direction de :", italics: true, size: 24 }),
            ],
        })
    );

    coverPageChildren.push(
        new Paragraph({
            children: [
                new TextRun({ text: authorName.toUpperCase(), bold: true, size: 28 }),
                new TextRun({ text: `\t\t\t\t\t${directorName.toUpperCase()}`, bold: true, size: 28 }),
            ],
            spacing: { after: 1000 },
        })
    );

    // Academic Year
    coverPageChildren.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({ text: `Année Académique : ${academicYear || new Date().getFullYear()}`, size: 24 }),
            ],
            spacing: { before: 1000 },
        })
    );

    // --- CONTENT PAGES ---
    const contentChildren = [];
    const plainTextContent = content.replace(/<[^>]*>?/gm, '\n').replace(/\n\s*\n/g, '\n\n');
    const contentSections = plainTextContent.split(/(?=INTRODUCTION\n|DÉVELOPPEMENT\n|CONCLUSION\n)/g);

    for (const section of contentSections) {
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
            contentChildren.push(
                new Paragraph({
                    heading: HeadingLevel.HEADING_1,
                    alignment: design.titleAlignment === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
                    children: [
                        new TextRun({
                            text: sectionTitle,
                            bold: true,
                            size: 36, // 18pt
                            color: design.themeColor,
                        }),
                    ],
                    spacing: { before: 400, after: 200 },
                })
            );
        }

        // Split by double newline for paragraphs
        const paragraphs = sectionText.split(/\n\n/);
        for (const p of paragraphs) {
            if (!p.trim()) continue;
            contentChildren.push(
                new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    children: [
                        new TextRun({
                            text: p.trim(),
                            size: 24, // 12pt
                            font: 'Times New Roman',
                        }),
                    ],
                    spacing: { line: 360, after: 200 }, // 1.5 spacing roughly
                })
            );
        }
    }

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        size: 24,
                        font: "Calibri",
                    },
                },
            },
        },
        sections: [
            {
                properties: {
                    page: {
                        borders: design.hasBorder ? {
                            pageBorders: {
                                display: PageBorderDisplay.ALL_PAGES,
                                zOrder: PageBorderZOrder.FRONT,
                                offsetFrom: PageBorderOffsetFrom.PAGE,
                            },
                        } : undefined,
                    },
                },
                children: [
                    ...coverPageChildren,
                    new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }), // Page break after cover
                    ...contentChildren,
                ],
            },
        ],
    });

    return await Packer.toBuffer(doc);
}
