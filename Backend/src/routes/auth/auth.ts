import { Router } from 'express';
import register from '@/controller/auth/register.js';
import login from '@/controller/auth/login.js';
import validationError from '@/middleware/validationError.js';
import { body } from 'express-validator';
import logout from '@/controller/auth/logout.js';

const router = Router();

router.post('/register',
    body('name')
    .isString().withMessage('Name must be a string').bail()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must contain 1 to 100 characters'),
    body('email')
    .isString().withMessage('Email must be a string').bail()
    .trim()
    .notEmpty()
    .withMessage('Email cannot be empty')
    .isLength({ max: 50 })
    .withMessage('Email adress must be less then 50 charachter')
    .isEmail()
    .withMessage('Invalid Email'),
    body('password')
    .isString().withMessage('Password must be a string').bail()
    .notEmpty()
    .withMessage('Password cannot be empty')
    .isLength({ min: 8 })
    .withMessage('Password lenght must be over then 8 charachter'),
    body('role')
    .not()
    .exists()
    .withMessage('Role cannot be specified during registration')
    ,validationError, register);

router.post('/login',
    body('email')
    .isString().withMessage('Email must be a string').bail()
    .trim()
    .notEmpty()
    .withMessage('Email cannot be empty')
    .isLength({ max: 50 })
    .withMessage('Email must be less then 50 character')
    .isEmail()
    .withMessage('Invalid Email'),
    body('password')
    .isString().withMessage('Password must be a string').bail()
    .notEmpty()
    .withMessage('Password cannot be empty')
    .isLength({ min: 8 })
    .withMessage('Password must be over then 8 charachter')
    ,validationError, login);

router.post('/logout', logout);

export default router;
