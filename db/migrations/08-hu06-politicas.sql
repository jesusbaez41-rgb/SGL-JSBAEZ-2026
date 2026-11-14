-- =====================================================================
-- HU-COM-06 - Permisos de aplicaciones por grupo y políticas de ejecución
--
-- ruta_ejecutable: ruta del binario YA INSTALADO en la PC (la usa AppLocker).
-- politica_laboratorio: política AppLocker combinada de un laboratorio.
-- politica_despliegue: estado del despliegue de la política por equipo.
--
-- Es segura de aplicar varias veces.
-- =====================================================================

ALTER TABLE aplicacion
    ADD COLUMN IF NOT EXISTS ruta_ejecutable VARCHAR(512);

CREATE TABLE IF NOT EXISTS politica_laboratorio (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laboratorio_id  UUID NOT NULL REFERENCES laboratorio(id) ON DELETE CASCADE,
    generada_por    UUID NOT NULL REFERENCES usuario(id)     ON DELETE RESTRICT,
    version         VARCHAR(64) NOT NULL,
    contenido       TEXT NOT NULL,
    resumen         JSONB,
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_politica_lab ON politica_laboratorio (laboratorio_id);

CREATE TABLE IF NOT EXISTS politica_despliegue (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    politica_id   UUID NOT NULL REFERENCES politica_laboratorio(id) ON DELETE CASCADE,
    equipo_id     UUID NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
    estado        VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADO','FALLIDO')),
    mensaje_error VARCHAR(512),
    salida        TEXT,
    intentos      INTEGER NOT NULL DEFAULT 0,
    fecha_reporte TIMESTAMPTZ,
    CONSTRAINT uq_politica_equipo UNIQUE (politica_id, equipo_id)
);
