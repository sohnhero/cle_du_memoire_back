import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../common/guards/auth.guard';
import { GoogleGenAI } from '@google/genai';

const router = Router();

// Initialize Gemini only if the API key is present
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
}) : null;

router.post('/correct', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Texte manquant' });
        }

        if (!ai) {
            // Mock response if no API key is set to allow testing locally
            // add a small delay to simulate network
            await new Promise(resolve => setTimeout(resolve, 1500));

            return res.json({
                original: text,
                corrected: `[CORRECTION SIMULÉE (Clé API manquante)]\n\n${text.replace(/a/g, 'à')}`,
                feedback: "Ceci est une correction simulée car la variable d'environnement GEMINI_API_KEY n'est pas configurée dans le backend."
            });
        }

        const aiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Voici le texte à corriger:\n\n${text}`,
            config: {
                systemInstruction: "Tu es un assistant de correction académique pour des étudiants en train de rédiger leur mémoire. Ton but est de reformuler, corriger les fautes de grammaire, d'orthographe et de syntaxe, et d'améliorer le style académique sans changer le sens fondamental du texte. Retourne UNIQUEMENT le texte corrigé, aucun commentaire autour.",
                temperature: 0.3,
            }
        });

        const responseText = aiResponse.text || '';

        res.json({
            original: text,
            corrected: responseText,
            feedback: 'Le texte a été révisé par Gemini pour améliorer le style académique et corriger les erreurs de syntaxe.'
        });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "Erreur lors de la communication avec l'IA." });
    }
});

export default router;
