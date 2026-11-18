import type { ErrorRequestHandler, Response } from 'express';
import { databaseErrorCode, isDatabaseUnavailable } from '@/db/resilience.js';
import { Prisma } from '@prisma/client';

export function sendDatabaseUnavailable(
    error: unknown,
    res: Response,
): boolean {
    if (!isDatabaseUnavailable(error)) return false;
    // Log only the error code; URLs, credentials and query arguments stay private.
    console.warn('[database] Request failed', {
        code: databaseErrorCode(error),
    });
    res.set('Retry-After', '1').status(503).json({
        status: 'Failed',
        code: 'DATABASE_UNAVAILABLE',
        message:
            'Veritabanına geçici olarak ulaşılamıyor. Lütfen kısa bir süre sonra tekrar deneyin.',
    });
    return true;
}

export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    next,
) => {
    if (res.headersSent) return next(error);
    if (sendDatabaseUnavailable(error, res)) return;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
            res.status(409).json({ status: 'Failed', message: 'A record with these unique fields already exists' });
            return;
        }
        if (error.code === 'P2025') {
            res.status(404).json({ status: 'Failed', message: 'Record not found' });
            return;
        }
    }
    const status =
        error &&
        typeof error === 'object' &&
        'status' in error &&
        typeof error.status === 'number' &&
        [400, 403, 413, 415].includes(error.status)
            ? error.status
            : 500;
    console.error('[http] Request failed', { status });
    res.status(status).json({
        status: 'Failed',
        message:
            ({ 400: 'Invalid request body', 403: 'Origin is not allowed by CORS',
                413: 'Request body too large', 415: 'Unsupported request encoding' } as Record<number, string>)[status]
            || 'Internal Server Error',
    });
};
