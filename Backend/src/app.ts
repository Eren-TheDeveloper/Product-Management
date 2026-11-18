import express, { urlencoded } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import CookieParser from 'cookie-parser';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import authRoutes from '@/routes/auth/auth.js';
import limiter from '@/lib/rateLimiter.js';
import productRoutes from '@/routes/products/productRoutes.js';
import config from '@/config/index.js';
import cartRoutes from '@/routes/sales/cartRoutes.js';
import salesRoutes from '@/routes/sales/salesRoutes.js';
import { checkDatabaseConnection } from '@/db/db.js';
import { databaseErrorCode } from '@/db/resilience.js';
import { errorHandler } from '@/middleware/databaseError.js';

export function createApp(
    options: { checkDatabase?: () => Promise<void> } = {},
) {
    const app = express();
    const allowedOrigins = new Set(
        (config.WHITELIST_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
    );
    const corsOptions: CorsOptions = {
        origin(origin, callback) {
            if (
                config.NODE_ENV === 'development' ||
                !origin ||
                allowedOrigins.has(origin)
            )
                callback(null, true);
            else callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 }));
        },
    };
    app.use(cors(corsOptions));
    app.use(helmet());
    app.use(compression({ threshold: 1024 }));
    app.use(express.json());
    app.use(urlencoded({ extended: true }));
    app.use(CookieParser());
    app.use(['/api', '/sale'], (_req, res, next) => {
        // Authenticated responses must not be reused from a browser/proxy cache.
        res.set('Cache-Control', 'private, no-store');
        res.vary('Authorization');
        next();
    });

    // Liveness checks must work even while the database is unavailable.
    app.get('/health/live', (_req, res) => {
        res.json({ status: 'ok' });
    });
    app.get('/health/ready', async (_req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            await (options.checkDatabase || checkDatabaseConnection)();
            res.json({ status: 'ready', database: 'up' });
        } catch (error) {
            console.warn('[database] Readiness failed', {
                code: databaseErrorCode(error),
            });
            res.set('Retry-After', '1')
                .status(503)
                .json({ status: 'not_ready', database: 'down' });
        }
    });

    app.use(limiter);
    app.use('/api/cart', cartRoutes);
    app.use('/sale', salesRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/products', productRoutes);
    app.use(errorHandler);
    return app;
}
