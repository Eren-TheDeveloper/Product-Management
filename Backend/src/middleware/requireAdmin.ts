import type { Request, Response, NextFunction } from 'express';

const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    if(!req.user) {
        return res
        .status(401)
        .json({
            status: 'Failed',
            message: 'Authentication required',
        });
    }

    if (req.user.role !== 'admin') {
        return res
        .status(403)
        .json({
            status: 'Failed',
            message: 'Admin permission required',
        });
    }

    return next();
}

export default requireAdmin;