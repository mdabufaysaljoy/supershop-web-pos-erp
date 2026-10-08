import { ERROR_CODES } from '@supershop/shared';
import multer from 'multer';
import { AppError, BadRequestError } from '../core/errors.js';

const MB = 1024 * 1024;

/**
 * Single-file multipart parser (CLAUDE.md §5.1). The file stays in memory (bounded by `maxBytes`)
 * and is NEVER trusted: callers sniff magic bytes and re-encode. Mount AFTER auth so anonymous
 * requests are rejected before any body is read. Text fields land in `req.body` (validate them).
 *
 * @param {{ field?: string, maxBytes: () => number, maxFields?: number }} opts
 *   `maxBytes` is read per request so the admin setting applies without a restart.
 */
export function singleFileUpload({ field = 'file', maxBytes, maxFields = 5 }) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: () => ({
      fileSize: maxBytes(),
      files: 1,
      fields: maxFields,
      fieldSize: 4 * 1024,
      parts: maxFields + 1,
      headerPairs: 50,
    }),
  }).single(field);

  return (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      return next(new BadRequestError('Expected multipart/form-data'));
    }
    parser(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, 'File too large', {
              status: 413,
              details: [{ path: field, code: 'validation.fileTooLarge', maxMb: maxBytes() / MB }],
            }),
          );
        }
        return next(new BadRequestError('Invalid upload', [{ path: field, code: err.code }]));
      }
      return next(err);
    });
  };
}
