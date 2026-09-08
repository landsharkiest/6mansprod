import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap an async route so rejections reach the Express error handler (Express 4). */
export const asyncHandler =
  (fn: AsyncRoute): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
