import { sendDatabaseUnavailable } from '@/middleware/databaseError.js';
import type { Request, Response } from 'express';
import { prisma } from '@/db/db.js'
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '@/lib/jwt.js';

type UserData = {
    name: string,
    email: string,
    password: string,
}

const register = async function(req: Request, res: Response ) {

    const { name, email, password } = req.body as UserData;

    try {

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if(user) {
            return res
            .status(400)
            .json({
                status: 'AlreadyHave',
                message: 'This user already have',
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'user',
            }
        });

            const accessToken = generateAccessToken(newUser.id);
            const refreshToken = generateRefreshToken(newUser.id);

            await prisma.token.create({
                data: {
                    token: refreshToken,
                    user: {
                        connect: {
                            id: newUser.id,
                        }
                    }
                },
            });

        if (!user) {
            return res
            .status(201)
            .json({
                status: "Successful",
                message: "New User Created",
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role,
                },
                accessToken,
                refreshToken,
            });

        } else {
            return res
            .status(400)
            .json({
                status: 'Failed',
                message: 'Already User with this email'
            });
        }

    } catch (error) {
        if (sendDatabaseUnavailable(error, res)) return;
        console.log('Failed on user regiseration', error);

        return res
        .status(400)
        .json({
            status: 'Failed',
            message: 'User register failed',
        })
    }

}

export default register;
