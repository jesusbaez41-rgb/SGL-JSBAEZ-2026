const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const storage = require('./apps.storage');

/**
 * Subida del instalador (HU-COM-07).
 *
 * El archivo se recibe en un directorio temporal y luego `apps.service`
 * lo mueve al directorio de instaladores, calcula su SHA-256 y da de alta
 * la aplicación (CA-01 / RNF-006).
 */
const TMP_DIR = path.join(os.tmpdir(), 'sgl-app-uploads');

function httpError(status, message, code, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

fs.mkdirSync(TMP_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, `${unique}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!storage.isAllowedExtension(file.originalname)) {
    return cb(
      httpError(
        400,
        'Extensión de instalador no permitida.',
        'INSTALADOR_EXTENSION_INVALIDA',
        { extensiones: storage.ALLOWED_EXTENSIONS },
      ),
    );
  }
  return cb(null, true);
}

const uploader = multer({
  storage: diskStorage,
  fileFilter,
  limits: { fileSize: storage.maxUploadBytes(), files: 1 },
});

/**
 * Middleware de un solo archivo que traduce los errores de multer a los
 * códigos de error del contrato de HU-COM-07.
 */
function single(field) {
  return function uploadMiddleware(req, res, next) {
    uploader.single(field)(req, res, (err) => {
      if (!err) return next();

      if (err.code === 'LIMIT_FILE_SIZE') {
        const maxMb = Math.round(storage.maxUploadBytes() / (1024 * 1024));
        return next(
          httpError(
            413,
            `El instalador supera el tamaño máximo permitido (${maxMb} MB).`,
            'INSTALADOR_DEMASIADO_GRANDE',
            { max_mb: maxMb },
          ),
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          httpError(400, 'Solo se admite un archivo por subida.', 'INSTALADOR_FALTANTE', {
            campo: err.field || field,
          }),
        );
      }
      if (err.code === 'INSTALADOR_EXTENSION_INVALIDA') return next(err);

      return next(
        httpError(400, 'No se pudo procesar el instalador enviado.', 'INSTALADOR_FALTANTE', {
          causa: err.message,
        }),
      );
    });
  };
}

module.exports = { single, TMP_DIR, httpError };