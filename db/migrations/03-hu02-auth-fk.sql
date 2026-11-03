-- =====================================================================
-- HU-COM-02 — Ajuste del trigger de inmutabilidad de EVENTO_AUTENTICACION
--
-- El FK usuario_id usa ON DELETE SET NULL para preservar el evento cuando
-- se elimina una cuenta. El trigger original bloqueaba también ese UPDATE
-- automático, impidiendo borrar usuarios con historial de acceso.
--
-- Se permite únicamente la anonimización de usuario_id (NULL) manteniendo
-- intactos el resto de campos del evento. DELETE sigue prohibido.
-- =====================================================================
BEGIN;

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

COMMIT;
