-- =====================================================================
-- HU-COM-14 — Autenticación, sesión y control de acceso por roles
-- Migración idempotente para bases ya existentes.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1) Estado de autenticación en USUARIO
-- ---------------------------------------------------------------------
ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bloqueado_hasta  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ultimo_login     TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- 2) SESION_WEB — sesión revocable asociada al JWT (CA-03, CA-10, CA-11)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesion_web (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jti               UUID NOT NULL,
    usuario_id        UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    rol               VARCHAR(32) NOT NULL,
    ip_origen         VARCHAR(45),
    user_agent        VARCHAR(255),
    creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultima_actividad  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en         TIMESTAMPTZ NOT NULL,
    revocada_en       TIMESTAMPTZ,
    motivo_revocacion VARCHAR(64),
    CONSTRAINT uq_sesion_web_jti UNIQUE (jti)
);

CREATE INDEX IF NOT EXISTS ix_sesion_web_usuario ON sesion_web (usuario_id);
CREATE INDEX IF NOT EXISTS ix_sesion_web_activa
    ON sesion_web (expira_en)
    WHERE revocada_en IS NULL;

-- ---------------------------------------------------------------------
-- 3) EVENTO_AUTENTICACION — auditoría de acceso (CA-12, CA-14)
--    Tabla append-only: los triggers impiden UPDATE y DELETE.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evento_autenticacion (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID REFERENCES usuario(id) ON DELETE SET NULL,
    uid_intentado   VARCHAR(64) NOT NULL,
    rol             VARCHAR(32),
    accion          VARCHAR(32) NOT NULL
                    CHECK (accion IN (
                        'LOGIN',
                        'LOGOUT',
                        'LOGIN_FALLIDO',
                        'LOGIN_BLOQUEADO',
                        'USUARIO_INACTIVO',
                        'SIN_ROL',
                        'ROL_NO_HABILITADO',
                        'ACCESO_DENEGADO',
                        'SESION_EXPIRADA',
                        'SESION_REVOCADA'
                    )),
    resultado       VARCHAR(16) NOT NULL
                    CHECK (resultado IN ('EXITO','FALLO')),
    ip_origen       VARCHAR(45),
    user_agent      VARCHAR(255),
    detalle         JSONB,
    fecha_evento    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_evento_auth_usuario ON evento_autenticacion (usuario_id);
CREATE INDEX IF NOT EXISTS ix_evento_auth_fecha   ON evento_autenticacion (fecha_evento DESC);
CREATE INDEX IF NOT EXISTS ix_evento_auth_accion  ON evento_autenticacion (accion);

CREATE OR REPLACE FUNCTION trg_evento_auth_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'La tabla EVENTO_AUTENTICACION es inmutable: no se permite DELETE.';
    END IF;

    -- Excepción controlada: ON DELETE SET NULL del usuario.
    IF NEW.usuario_id IS NULL
       AND OLD.usuario_id IS NOT NULL
       AND NEW.id = OLD.id
       AND NEW.uid_intentado IS NOT DISTINCT FROM OLD.uid_intentado
       AND NEW.rol IS NOT DISTINCT FROM OLD.rol
       AND NEW.accion IS NOT DISTINCT FROM OLD.accion
       AND NEW.resultado IS NOT DISTINCT FROM OLD.resultado
       AND NEW.ip_origen IS NOT DISTINCT FROM OLD.ip_origen
       AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
       AND NEW.detalle IS NOT DISTINCT FROM OLD.detalle
       AND NEW.fecha_evento IS NOT DISTINCT FROM OLD.fecha_evento
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'La tabla EVENTO_AUTENTICACION es inmutable: no se permite UPDATE.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_evento_auth_block_update ON evento_autenticacion;
CREATE TRIGGER tg_evento_auth_block_update
    BEFORE UPDATE ON evento_autenticacion
    FOR EACH ROW
    EXECUTE FUNCTION trg_evento_auth_inmutable();

DROP TRIGGER IF EXISTS tg_evento_auth_block_delete ON evento_autenticacion;
CREATE TRIGGER tg_evento_auth_block_delete
    BEFORE DELETE ON evento_autenticacion
    FOR EACH ROW
    EXECUTE FUNCTION trg_evento_auth_inmutable();

COMMIT;
