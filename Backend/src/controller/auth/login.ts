import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import config from '@/config/index.js';
import { prisma } from '@/db/db.js';
import { generateAccessToken, generateRefreshToken } from '@/lib/jwt.js';
import bcrypt from 'bcrypt';

import type { Request, Response } from 'express';

type UserData = {
    email: string,
    password: string,
}

const login = async (req: Request, res: Response ) => {
    const { email, password } = req.body as UserData;

    if (!email || !password) {
        return res
        .status(400)
        .json({
            status: 'Failed',
            message: 'Email and password are required',
        });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return res
            .status(404)
            .json({
                status: 'failed',
                message: `Not avaliable account with this ${email} adress`,
            })
        }

        const comparePassword = await bcrypt.compare(password, user.password);

        if (!comparePassword) {
            return res
            .status(401)
            .json({
                status: 'Failed',
                message: 'Invalid Password',
            });
        }

        const accessToken = generateAccessToken(user.id);
        const refreshToken = generateRefreshToken(user.id);

        await prisma.token.create({
            data: {
                token: refreshToken,
                user: {
                    connect: {
                        id: user.id
                    }
                }
            }
        });

        return res
        .status(200)
        .json({
            status: 'Successful',
            message: 'Login Successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            accessToken,
            refreshToken,
        });

    } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
        console.log('Failed on Login attempt', error);

        return res
        .status(500)
        .json({
            status: 'Failed',
            message: 'Internal Server Error',
        });
    }
}

export default login;
