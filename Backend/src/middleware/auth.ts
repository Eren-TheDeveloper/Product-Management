import type { Request, Response, NextFunction } from 'express';
import config from '@/config/index.js'
import { prisma } from '@/db/db.js';
import jwt from 'jsonwebtoken';

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.get('Authorization');

    if (!authorization) {
        return res
        .status(401)
        .json({
            status: 'Failed',
            message: 'Authorization failed'
        });
    };

    const [scheme, token, extra] = authorization.trim().split(/\s+/);

    if(scheme?.toLowerCase() !== 'bearer' || !token || extra) {
        return res
        .status(401)
        .json({
            status: 'Failed',
            message: 'Authorization format must be Bearer <token>'
        });
    };

    try {
        const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, {
            algorithms: ['HS256'],
            subject: 'accessApi'
        });

        if (typeof payload === 'string' || typeof payload.id !== 'string' || !payload.id) {
            return res
            .status(401)
            .json({
                status: 'Failed',
                message: 'Invalid token payload'
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                id: payload.id
            },
            select: {
                id: true,
                role: true
            }
        });

        if(!user) {
            return res
            .status(401)
            .json({
                status: 'Failed',
                message: 'User not found'
            });
        }

        req.user = user;

        return next();

    } catch (error) {
        if (!(error instanceof jwt.JsonWebTokenError)) {
            return next(error);
        }

        return res
        .status(401)
        .json({
            status: 'Failed',
            message: 'Invalid or expired access token',
        });
    }

}

export default authenticate;
