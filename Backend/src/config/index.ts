import dotenv from 'dotenv';
import type ms from 'ms';

dotenv.config();

const config = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    WHITELIST_ORIGINS: process.env.WHITELIST_ORIGINS,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_TOKEN_EXPIRE: process.env.JWT_TOKEN_EXPIRE as ms.StringValue,
    JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE as ms.StringValue,
    WHITELIST_MAIL: process.env.WHITELIST_MAIL,
};

export default config;