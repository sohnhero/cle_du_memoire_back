import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './auth/auth.routes';
import userRoutes from './users/users.routes';
import packRoutes from './packs/packs.routes';
import documentRoutes from './documents/documents.routes';
import messagingRoutes from './messaging/messaging.routes';
import adminRoutes from './admin/admin.routes';
import memoireRoutes from './memoire/memoire.routes';
import notificationRoutes from './notifications/notifications.routes';
import aiRoutes from './ai/ai.routes';
import calendarRoutes from './calendar/calendar.routes';
import resourcesRoutes from './resources/resources.routes';
import exportRoutes from './export/export.routes';

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://cle-du-memoire-front.vercel.app'
    ];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || corsOrigin.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.warn(`CORS blocked for origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/packs', packRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/messaging', messagingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/memoires', memoireRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Clé du Mémoire API running on port ${PORT}`);
    });
}

export default app;
