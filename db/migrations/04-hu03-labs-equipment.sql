-- =====================================================================
-- HU-COM-03 — Validación de subred de laboratorio (CA-02)
--
-- El CHECK original solo valida la forma; este trigger valida además que
-- la dirección sea IPv4 válida (octetos 0-255) y el prefijo 0-32.
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION trg_laboratorio_subred_valida()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.subred !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$' THEN
        RAISE EXCEPTION 'Subred inválida: use formato CIDR IPv4 (ej. 192.168.100.0/24).';
    END IF;

    BEGIN
        PERFORM NEW.subred::inet;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Subred inválida: dirección IPv4 fuera de rango.';
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_laboratorio_subred_valida ON laboratorio;
CREATE TRIGGER tg_laboratorio_subred_valida
    BEFORE INSERT OR UPDATE ON laboratorio
    FOR EACH ROW
    EXECUTE FUNCTION trg_laboratorio_subred_valida();

COMMIT;
