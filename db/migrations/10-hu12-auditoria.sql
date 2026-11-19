-- =====================================================================
-- HU-COM-12 - Auditoria y trazabilidad inmutable
--
-- 1) Agrega laboratorio_id / equipo_id a auditoria (CA-02).
-- 2) Bloquea TRUNCATE ademas de UPDATE/DELETE (CA-03/CA-05).
-- 3) Crea el rol de aplicacion sgl_app sin privilegios de modificacion
--    sobre auditoria ni evento_autenticacion (CA-06).
--
-- Es segura de aplicar varias veces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas de contexto
-- ---------------------------------------------------------------------
-- Sin FK: la auditoría debe conservar el contexto aunque se borre el
-- laboratorio o el equipo. Una FK con ON DELETE SET NULL dispararía el
-- trigger de inmutabilidad y bloquearía el borrado.
ALTER TABLE auditoria
    ADD COLUMN IF NOT EXISTS laboratorio_id UUID;

ALTER TABLE auditoria
    ADD COLUMN IF NOT EXISTS equipo_id UUID;

ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS auditoria_laboratorio_id_fkey;
ALTER TABLE auditoria DROP CONSTRAINT IF EXISTS auditoria_equipo_id_fkey;

CREATE INDEX IF NOT EXISTS ix_auditoria_laboratorio ON auditoria (laboratorio_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_equipo      ON auditoria (equipo_id);

COMMENT ON COLUMN auditoria.laboratorio_id IS 'Laboratorio afectado (HU-COM-12, CA-02)';
COMMENT ON COLUMN auditoria.equipo_id      IS 'Equipo afectado (HU-COM-12, CA-02)';

-- ---------------------------------------------------------------------
-- 2) Inmutabilidad: UPDATE/DELETE (recreados por si la instalacion es
--    nueva o el trigger fue eliminado) y TRUNCATE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_auditoria_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'La tabla AUDITORIA es inmutable: no se permite UPDATE ni DELETE (RNF-020).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_auditoria_block_update ON auditoria;
CREATE TRIGGER tg_auditoria_block_update
    BEFORE UPDATE ON auditoria
    FOR EACH ROW
    EXECUTE FUNCTION trg_auditoria_inmutable();

DROP TRIGGER IF EXISTS tg_auditoria_block_delete ON auditoria;
CREATE TRIGGER tg_auditoria_block_delete
    BEFORE DELETE ON auditoria
    FOR EACH ROW
    EXECUTE FUNCTION trg_auditoria_inmutable();

-- Relleno de las filas historicas usando el detalle JSON. El trigger de
-- inmutabilidad se desactiva solo dentro de esta migracion y se vuelve a
-- activar antes de terminar.
ALTER TABLE auditoria DISABLE TRIGGER tg_auditoria_block_update;

UPDATE auditoria
SET laboratorio_id = (detalle->>'laboratorio_id')::uuid
WHERE laboratorio_id IS NULL
  AND detalle ? 'laboratorio_id'
  AND (detalle->>'laboratorio_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE auditoria
SET equipo_id = (detalle->>'equipo_id')::uuid
WHERE equipo_id IS NULL
  AND detalle ? 'equipo_id'
  AND (detalle->>'equipo_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

ALTER TABLE auditoria ENABLE TRIGGER tg_auditoria_block_update;

CREATE OR REPLACE FUNCTION trg_auditoria_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'La tabla AUDITORIA es inmutable: no se permite TRUNCATE (RNF-020).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_auditoria_block_truncate ON auditoria;
CREATE TRIGGER tg_auditoria_block_truncate
    BEFORE TRUNCATE ON auditoria
    FOR EACH STATEMENT
    EXECUTE FUNCTION trg_auditoria_no_truncate();

-- ---------------------------------------------------------------------
-- 3) Rol de aplicacion con privilegios minimos
--
-- El backend deja de conectarse como sgl_user (superusuario) y lo hace
-- como sgl_app. Asi no puede deshabilitar triggers ni alterar/borrar
-- auditoria, aunque la API tuviera un bug.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgl_app') THEN
        CREATE ROLE sgl_app LOGIN;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE sgl TO sgl_app;
GRANT USAGE ON SCHEMA public TO sgl_app;

-- Permisos generales para el resto del esquema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sgl_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sgl_app;

-- Tablas append-only: solo lectura e insercion.
REVOKE ALL ON auditoria FROM sgl_app;
GRANT SELECT, INSERT ON auditoria TO sgl_app;

REVOKE ALL ON evento_autenticacion FROM sgl_app;
GRANT SELECT, INSERT ON evento_autenticacion TO sgl_app;

-- Objetos futuros creados por sgl_user.
ALTER DEFAULT PRIVILEGES FOR ROLE sgl_user IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sgl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sgl_user IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO sgl_app;

COMMENT ON ROLE sgl_app IS 'Rol de aplicacion SGL: sin UPDATE/DELETE/TRUNCATE sobre auditoria (HU-COM-12, CA-06)';
