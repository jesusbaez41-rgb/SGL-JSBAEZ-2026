-- =====================================================================
-- HU-COM-07 - Subida de instaladores por el administrador
--
-- La columna origen distingue de donde sale el instalador de una aplicacion:
--   upload -> lo subio el administrador (se guarda en APPS_INSTALLERS_DIR y el
--            backend calcula su SHA-256).
--   ruta   -> el instalador ya estaba en el servidor y se referencia por su
--            ruta (comportamiento anterior).
--
-- Es segura de aplicar varias veces.
-- =====================================================================

ALTER TABLE aplicacion
    ADD COLUMN IF NOT EXISTS origen VARCHAR(16) NOT NULL DEFAULT 'ruta';

COMMENT ON COLUMN aplicacion.origen IS
    'Origen del instalador: upload (subido por el administrador) | ruta (ya estaba en el servidor)';
