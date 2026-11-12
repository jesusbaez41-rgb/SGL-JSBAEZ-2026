-- =====================================================================
-- HU-COM-08 - Fases del despliegue y salida del comando remoto
--
-- fase   : ENVIANDO | EJECUTANDO | FINALIZADO | ESPERANDO (visible en la UI)
-- salida : salida del agente con el resultado de la orden ejecutada
--
-- Es segura de aplicar varias veces.
-- =====================================================================

ALTER TABLE despliegue_equipo
    ADD COLUMN IF NOT EXISTS fase VARCHAR(24);
ALTER TABLE despliegue_equipo
    ADD COLUMN IF NOT EXISTS salida TEXT;
