-- =====================================================================
-- HU-COM-09 - Control de navegación por listas blancas de URLs
--
-- Extiende el esquema base (RN-016):
--   lista_blanca_url   : dominio permitido por grupo + metadatos de gestión.
--   sesion_activa      : IP y grupos del estudiante que inició sesión en la PC.
--   navegacion_laboratorio : configuración de filtrado generada (Squid/PAC/PC).
--   navegacion_despliegue  : estado del despliegue por equipo (CA-08).
--
-- Es segura de aplicar varias veces.
-- =====================================================================

-- 1) Listas blancas: descripción, autor y fecha de modificación.
ALTER TABLE lista_blanca_url
    ADD COLUMN IF NOT EXISTS descripcion VARCHAR(255);

ALTER TABLE lista_blanca_url
    ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuario(id) ON DELETE SET NULL;

ALTER TABLE lista_blanca_url
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_lista_blanca_activa
    ON lista_blanca_url (grupo_id)
    WHERE activa = TRUE;

-- 2) Sesión del estudiante en la PC (CA-04): IP origen y grupos aplicados.
ALTER TABLE sesion_activa
    ADD COLUMN IF NOT EXISTS ip_origen VARCHAR(45);

ALTER TABLE sesion_activa
    ADD COLUMN IF NOT EXISTS grupos JSONB;

CREATE INDEX IF NOT EXISTS ix_sesion_equipo_activa
    ON sesion_activa (equipo_id)
    WHERE activa = TRUE;

-- 3) Configuración de filtrado generada por laboratorio (CA-07).
CREATE TABLE IF NOT EXISTS navegacion_laboratorio (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laboratorio_id   UUID NOT NULL REFERENCES laboratorio(id) ON DELETE CASCADE,
    generada_por     UUID NOT NULL REFERENCES usuario(id)     ON DELETE RESTRICT,
    version          VARCHAR(64) NOT NULL,
    config_squid     TEXT NOT NULL,
    config_pac       TEXT,
    script_pc        TEXT NOT NULL,
    resumen          JSONB,
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_navegacion_lab
    ON navegacion_laboratorio (laboratorio_id, fecha_generacion DESC);

-- 4) Estado del despliegue de la configuración por equipo (CA-08, CA-09).
CREATE TABLE IF NOT EXISTS navegacion_despliegue (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    navegacion_id UUID NOT NULL REFERENCES navegacion_laboratorio(id) ON DELETE CASCADE,
    equipo_id     UUID NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    estado        VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADO','FALLIDO')),
    mensaje_error VARCHAR(512),
    salida        TEXT,
    intentos      INTEGER NOT NULL DEFAULT 0,
    fecha_reporte TIMESTAMPTZ,
    CONSTRAINT uq_navegacion_equipo UNIQUE (navegacion_id, equipo_id)
);

CREATE INDEX IF NOT EXISTS ix_navegacion_despliegue_estado
    ON navegacion_despliegue (estado);

-- 5) Rol de aplicación: la migración puede ejecutarse fuera del bootstrap.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgl_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON navegacion_laboratorio TO sgl_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON navegacion_despliegue TO sgl_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON lista_blanca_url      TO sgl_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON config_filtrado       TO sgl_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON sesion_activa         TO sgl_app;
    END IF;
END
$$;
