-- =====================================================================
-- HU-COM-06 fase 2 - Perfil de bloqueo para estudiantes
--
-- laboratorio.bloqueo: configuracion del bloqueo por laboratorio.
-- politica_laboratorio.config: configuracion usada al generar la politica
--                              e incluye el script de bloqueo.
--
-- Es segura de aplicar varias veces.
-- =====================================================================

ALTER TABLE laboratorio
    ADD COLUMN IF NOT EXISTS bloqueo JSONB;

ALTER TABLE politica_laboratorio
    ADD COLUMN IF NOT EXISTS config JSONB;
