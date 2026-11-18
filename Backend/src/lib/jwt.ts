import config from '@/config/index.js';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

export const generateAccessToken = (id: string): string => {
    return jwt.sign({ id }, config.JWT_ACCESS_SECRET, {
        expiresIn: config.JWT_TOKEN_EXPIRE,
        subject: 'accessApi'
    });
};

export const generateRefreshToken = (id: string): string => {
    return jwt.sign({ id }, config.JWT_REFRESH_SECRET, {
        expiresIn: config.JWT_REFRESH_EXPIRE,
        subject: 'refreshToken',
        jwtid: randomUUID()
    });
};
