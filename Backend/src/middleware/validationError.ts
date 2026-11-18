import { validationResult } from 'express-validator';

import type { Request, Response, NextFunction } from 'express';

const validationError = async (req: Request, res: Response, next: NextFunction) => {
    const error = validationResult(req);

    if(!error.isEmpty()) {
        res
        .status(400)
        .json({
            status: 'Failed',
            error: error.mapped(),
        });

        return;
    }

    next();
}

export default validationError;
