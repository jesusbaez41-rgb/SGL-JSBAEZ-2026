-- =====================================================================
-- HU-COM-08 - Despliegue remoto de aplicaciones
--
-- La columna comando_desinstalacion guarda el comando PowerShell que el
-- backend ejecuta en el equipo para desinstalar la aplicacion (CA-04).
-- Si queda vacia, para los instaladores .msi se usa msiexec /x.
--
-- Es segura de aplicar varias veces.
-- =====================================================================

ALTER TABLE aplicacion
    ADD COLUMN IF NOT EXISTS comando_desinstalacion TEXT;

COMMENT ON COLUMN aplicacion.comando_desinstalacion IS
    'Comando PowerShell de desinstalacion remota (HU-COM-08, CA-04)';
