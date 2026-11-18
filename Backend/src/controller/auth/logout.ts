import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@/db/db.js';
import jwt from 'jsonwebtoken';
import config from '@/config/index.js'

const logout = async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.get('Authorization');

    if(!authorization) {
        return res
        .status(401)
        .json({
            status: 'Failed',
            message: 'Authorization Error'
        });
    }

    const [scheme, token, extra] = authorization.trim().split(/\s+/);

    if(scheme.toLowerCase() !== 'bearer' || !token || extra) {
        return res
        .status(401)
        .json({
            status: 'Failed',
            message: 'Invalid format must be Bearer <token> fromat',
        });
    }

    try {
        const payload = jwt.verify(token, config.JWT_REFRESH_SECRET, {
            algorithms: ['HS256'],
            subject: 'refreshToken',
        });

        if(typeof payload === 'string' || typeof payload.id !== 'string' || !payload.id) {
            return res
            .status(400)
            .json({
                status: 'Failed',
                message: 'Invalid token payload',
            });
        }

        await prisma.token.deleteMany({
            where: {
                token,
                userId: payload.id,
            }
        });

        return res
        .status(200)
        .json({
            status: 'Successful',
            message: 'Successfully logout'
        })

    } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
        console.log('Failed logout', error);

        if (error instanceof jwt.JsonWebTokenError) {
            return res
            .status(401)
            .json({
                status: 'Failed',
                message: 'Invalid or expired refresh token'
            });
        }

        return next(error);
    }
}

export default logout;