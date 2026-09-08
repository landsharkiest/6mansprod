import type { Request } from 'express';
import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Parse `data` with a zod schema, returning its output type (defaults and transforms applied). */
function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, what: string): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(`Invalid ${what}`, result.error.flatten());
  return result.data as z.output<S>;
}

export const parseBody = <S extends z.ZodTypeAny>(req: Request, schema: S) => parse(schema, req.body, 'request body');
export const parseQuery = <S extends z.ZodTypeAny>(req: Request, schema: S) => parse(schema, req.query, 'query');
export const parseParams = <S extends z.ZodTypeAny>(req: Request, schema: S) => parse(schema, req.params, 'path parameter');
