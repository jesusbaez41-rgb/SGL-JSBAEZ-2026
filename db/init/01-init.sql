-- =====================================================================
-- SGL - Sistema de Gestión de Laboratorios
-- PostgreSQL 16
-- Ejecutar como superusuario o como POSTGRES_USER al iniciar el contenedor
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Extensiones
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- alternativa si prefieres uuid_generate_v4()

-- Zona horaria por defecto
SET TIME ZONE 'America/Asuncion';

-- =====================================================================
-- 1) TIPOS ENUMERADOS (como CHECK, según Tabla 61-68)
-- =====================================================================

-- =====================================================================
-- 2) TABLA: USUARIO
-- =====================================================================
CREATE TABLE usuario (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid               VARCHAR(64)  NOT NULL,
    email             VARCHAR(255) NOT NULL,
    nombre_completo   VARCHAR(255) NOT NULL,
    rol               VARCHAR(32)  NOT NULL
                      CHECK (rol IN ('ADMIN_ACADEMICO','ADMIN_TECNICO','DOCENTE','ESTUDIANTE')),
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,
    samba_sid         VARCHAR(128),
    samba_dn          VARCHAR(512) NOT NULL,
    -- HU-COM-14: control de intentos fallidos y bloqueo temporal (CA-09)
    intentos_fallidos INTEGER      NOT NULL DEFAULT 0,
    bloqueado_hasta   TIMESTAMPTZ,
    ultimo_login      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_usuario_uid    UNIQUE (uid),
    CONSTRAINT uq_usuario_email  UNIQUE (email),
    CONSTRAINT uq_usuario_sid    UNIQUE (samba_sid),
    CONSTRAINT uq_usuario_dn     UNIQUE (samba_dn)
);

CREATE INDEX ix_usuario_rol     ON usuario (rol);
CREATE INDEX ix_usuario_activo  ON usuario (activo);

-- =====================================================================
-- 3) TABLA: GRUPO
-- =====================================================================
CREATE TABLE grupo (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo        VARCHAR(32)  NOT NULL,
    descripcion   VARCHAR(255),
    samba_sid     VARCHAR(128) NOT NULL,
    samba_dn      VARCHAR(512) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_grupo_codigo UNIQUE (codigo),
    CONSTRAINT uq_grupo_sid    UNIQUE (samba_sid),
    CONSTRAINT uq_grupo_dn     UNIQUE (samba_dn)
);

-- =====================================================================
-- 4) TABLA: MEMBRESIA_GRUPO
-- =====================================================================
CREATE TABLE membresia_grupo (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    grupo_id          UUID NOT NULL REFERENCES grupo(id)   ON DELETE CASCADE,
    fecha_asignacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    activa            BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_membresia_usuario_grupo UNIQUE (usuario_id, grupo_id)
);

CREATE INDEX ix_membresia_usuario ON membresia_grupo (usuario_id);
CREATE INDEX ix_membresia_grupo   ON membresia_grupo (grupo_id);

-- =====================================================================
-- 5) TABLA: ASIGNACION_DOCENTE
-- =====================================================================
CREATE TABLE asignacion_docente (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    docente_id        UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    grupo_id          UUID NOT NULL REFERENCES grupo(id)   ON DELETE CASCADE,
    fecha_asignacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_asignacion_docente_grupo UNIQUE (docente_id, grupo_id)
);

CREATE INDEX ix_asignacion_docente_grupo ON asignacion_docente (grupo_id);

-- =====================================================================
-- 6) TABLA: LABORATORIO
-- =====================================================================
CREATE TABLE laboratorio (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(128) NOT NULL,
    ubicacion   VARCHAR(255) NOT NULL,
    subred      VARCHAR(64)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_laboratorio_nombre UNIQUE (nombre),
    CONSTRAINT ck_laboratorio_subred CHECK (subred ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$')
);

-- =====================================================================
-- 7) TABLA: EQUIPO
-- =====================================================================
CREATE TABLE equipo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mac_address     VARCHAR(17) NOT NULL,
    hostname        VARCHAR(64) NOT NULL,
    ip_address      VARCHAR(45),
    laboratorio_id  UUID        NOT NULL REFERENCES laboratorio(id) ON DELETE RESTRICT,
    estado          VARCHAR(16) NOT NULL DEFAULT 'DESCONOCIDO'
                    CHECK (estado IN ('ENCENDIDO','APAGADO','DESCONOCIDO')),
    mesh_agent_id   VARCHAR(128),
    ultimo_reporte  TIMESTAMPTZ,
    CONSTRAINT uq_equipo_mac       UNIQUE (mac_address),
    CONSTRAINT uq_equipo_hostname  UNIQUE (hostname),
    CONSTRAINT uq_equipo_mesh      UNIQUE (mesh_agent_id)
);

CREATE INDEX ix_equipo_laboratorio ON equipo (laboratorio_id);
CREATE INDEX ix_equipo_estado      ON equipo (estado);

-- =====================================================================
-- 8) TABLA: SESION_ACTIVA
-- =====================================================================
CREATE TABLE sesion_activa (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    equipo_id   UUID NOT NULL REFERENCES equipo(id)  ON DELETE CASCADE,
    hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    hora_fin    TIMESTAMPTZ,
    activa      BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX ix_sesion_usuario ON sesion_activa (usuario_id);
CREATE INDEX ix_sesion_equipo  ON sesion_activa (equipo_id);
CREATE INDEX ix_sesion_activa  ON sesion_activa (activa) WHERE activa = TRUE;

-- =====================================================================
-- 9) TABLA: APLICACION
-- =====================================================================
CREATE TABLE aplicacion (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre                 VARCHAR(128) NOT NULL,
    ruta_instalador        VARCHAR(512) NOT NULL,
    parametros_silenciosos TEXT,
    version                VARCHAR(32)  NOT NULL,
    checksum               VARCHAR(128) NOT NULL,   -- SHA-256
    origen                 VARCHAR(16)  NOT NULL DEFAULT 'ruta', -- upload | ruta (HU-COM-07)
    comando_desinstalacion TEXT,                        -- HU-COM-08 (CA-04)
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_aplicacion_nombre ON aplicacion (nombre);

-- =====================================================================
-- 10) TABLA: VINCULO_APP_LAB
-- =====================================================================
CREATE TABLE vinculo_app_lab (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id             UUID NOT NULL REFERENCES aplicacion(id)   ON DELETE CASCADE,
    laboratorio_id     UUID NOT NULL REFERENCES laboratorio(id)  ON DELETE CASCADE,
    activo             BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_vinculacion  TIMESTAMPTZ NOT NULL DEFAULT now()
    -- RN-007: una sola versión activa por app y laboratorio.
    -- Se controla con un índice único parcial sobre filas activas (más abajo).
);

CREATE INDEX ix_vinculo_lab ON vinculo_app_lab (laboratorio_id);

-- =====================================================================
-- 11) TABLA: PERMISO_APP_GRUPO
-- =====================================================================
CREATE TABLE permiso_app_grupo (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vinculo_id     UUID NOT NULL REFERENCES vinculo_app_lab(id) ON DELETE CASCADE,
    grupo_id       UUID NOT NULL REFERENCES grupo(id)           ON DELETE CASCADE,
    habilitado     BOOLEAN     NOT NULL DEFAULT FALSE,   -- RN-008
    fecha_config   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_permiso_vinculo_grupo UNIQUE (vinculo_id, grupo_id)
);

CREATE INDEX ix_permiso_grupo ON permiso_app_grupo (grupo_id);

-- =====================================================================
-- 12) TABLA: DESPLIEGUE
-- =====================================================================
CREATE TABLE despliegue (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vinculo_id     UUID NOT NULL REFERENCES vinculo_app_lab(id) ON DELETE RESTRICT,
    usuario_id     UUID NOT NULL REFERENCES usuario(id)         ON DELETE RESTRICT,
    tipo           VARCHAR(16) NOT NULL CHECK (tipo IN ('INSTALAR','DESINSTALAR')),
    fecha_inicio   TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_fin      TIMESTAMPTZ,
    total_equipos  INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX ix_despliegue_vinculo ON despliegue (vinculo_id);
CREATE INDEX ix_despliegue_usuario ON despliegue (usuario_id);

-- =====================================================================
-- 13) TABLA: DESPLIEGUE_EQUIPO
-- =====================================================================
CREATE TABLE despliegue_equipo (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    despliegue_id  UUID NOT NULL REFERENCES despliegue(id) ON DELETE CASCADE,
    equipo_id      UUID NOT NULL REFERENCES equipo(id)     ON DELETE RESTRICT,
    estado         VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE'
                   CHECK (estado IN ('PENDIENTE','EN_PROCESO','COMPLETADO','FALLIDO')),
    fase           VARCHAR(24),                              -- HU-COM-08: fase visible
    salida         TEXT,                                    -- HU-COM-08: salida del agente
    mensaje_error  VARCHAR(512),
    intentos       INTEGER     NOT NULL DEFAULT 0,
    fecha_reporte  TIMESTAMPTZ,
    CONSTRAINT uq_despliegue_equipo UNIQUE (despliegue_id, equipo_id)
);

CREATE INDEX ix_despliegue_equipo_estado ON despliegue_equipo (estado);
CREATE INDEX ix_despliegue_equipo_equipo ON despliegue_equipo (equipo_id);

-- =====================================================================
-- 14) TABLA: LISTA_BLANCA_URL
-- =====================================================================
CREATE TABLE lista_blanca_url (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id    UUID NOT NULL REFERENCES grupo(id) ON DELETE CASCADE,
    url         VARCHAR(512) NOT NULL,
    fecha_alta  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    activa      BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_lista_blanca_grupo_url UNIQUE (grupo_id, url)
);

CREATE INDEX ix_lista_blanca_grupo ON lista_blanca_url (grupo_id);

-- =====================================================================
-- 15) TABLA: POLITICA_EJECUCION
-- =====================================================================
CREATE TABLE politica_ejecucion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id          UUID NOT NULL REFERENCES grupo(id)         ON DELETE CASCADE,
    laboratorio_id    UUID NOT NULL REFERENCES laboratorio(id)    ON DELETE CASCADE,
    reglas_applocker  TEXT NOT NULL,
    gpo_xml           TEXT,
    version           VARCHAR(32) NOT NULL,
    fecha_generacion  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_politica_grupo_lab UNIQUE (grupo_id, laboratorio_id)
);

-- =====================================================================
-- 16) TABLA: CONFIG_FILTRADO
-- =====================================================================
CREATE TABLE config_filtrado (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id            UUID NOT NULL REFERENCES grupo(id)       ON DELETE CASCADE,
    laboratorio_id      UUID NOT NULL REFERENCES laboratorio(id)  ON DELETE CASCADE,
    config_squid        TEXT NOT NULL,
    config_squidguard   TEXT NOT NULL,
    version             VARCHAR(32) NOT NULL,
    fecha_generacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_config_grupo_lab UNIQUE (grupo_id, laboratorio_id)
);

-- =====================================================================
-- 17) TABLA: AUDITORIA
-- =====================================================================
CREATE TABLE auditoria (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
    accion            VARCHAR(32) NOT NULL
                      CHECK (accion IN ('CREAR','ACTUALIZAR','ELIMINAR','DESPLEGAR','CAMBIO_PERMISO','EJECUTAR')),
    entidad_afectada  VARCHAR(64) NOT NULL,
    entidad_id        UUID,
    detalle           JSONB,
    ip_origen         VARCHAR(45),
    fecha_evento      TIMESTAMPTZ NOT NULL DEFAULT now(),
    inmutable         BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX ix_auditoria_usuario  ON auditoria (usuario_id);
CREATE INDEX ix_auditoria_entidad  ON auditoria (entidad_afectada, entidad_id);
CREATE INDEX ix_auditoria_fecha    ON auditoria (fecha_evento DESC);

-- =====================================================================
-- 18) TABLA: ARCHIVO_ACADEMICO
-- =====================================================================
CREATE TABLE archivo_academico (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    nombre      VARCHAR(255) NOT NULL,
    tipo        VARCHAR(64)  NOT NULL,   -- MIME type
    tamano      BIGINT       NOT NULL,   -- bytes
    ruta_smb    VARCHAR(512) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_archivo_usuario ON archivo_academico (usuario_id);

-- =====================================================================
-- 19) TABLAS DE AUTENTICACIÓN WEB (HU-COM-14)
-- =====================================================================

-- 19.1) SESION_WEB — sesión revocable asociada al JWT (CA-03, CA-10, CA-11)
CREATE TABLE sesion_web (
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

CREATE INDEX ix_sesion_web_usuario ON sesion_web (usuario_id);
CREATE INDEX ix_sesion_web_activa
    ON sesion_web (expira_en)
    WHERE revocada_en IS NULL;

-- 19.2) EVENTO_AUTENTICACION — auditoría de acceso (CA-12, CA-14)
--       Append-only: los triggers impiden UPDATE y DELETE.
CREATE TABLE evento_autenticacion (
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

CREATE INDEX ix_evento_auth_usuario ON evento_autenticacion (usuario_id);
CREATE INDEX ix_evento_auth_fecha   ON evento_autenticacion (fecha_evento DESC);
CREATE INDEX ix_evento_auth_accion  ON evento_autenticacion (accion);

-- =====================================================================
-- 20) TRIGGERS
-- =====================================================================

-- 19.1) updated_at automático en USUARIO
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_usuario_updated_at
    BEFORE UPDATE ON usuario
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

-- 20.0) Validación de subred de laboratorio (HU-COM-03, CA-02)
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

-- 19.2) Inmutabilidad de AUDITORIA (RNF-020)
CREATE OR REPLACE FUNCTION trg_auditoria_inmutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'La tabla AUDITORIA es inmutable: no se permite UPDATE ni DELETE (RNF-020).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_auditoria_block_update
    BEFORE UPDATE ON auditoria
    FOR EACH ROW
    EXECUTE FUNCTION trg_auditoria_inmutable();

CREATE TRIGGER tg_auditoria_block_delete
    BEFORE DELETE ON auditoria
    FOR EACH ROW
    EXECUTE FUNCTION trg_auditoria_inmutable();

-- 20.2) Inmutabilidad de EVENTO_AUTENTICACION (HU-COM-14, CA-12)
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

CREATE TRIGGER tg_evento_auth_block_update
    BEFORE UPDATE ON evento_autenticacion
    FOR EACH ROW
    EXECUTE FUNCTION trg_evento_auth_inmutable();

CREATE TRIGGER tg_evento_auth_block_delete
    BEFORE DELETE ON evento_autenticacion
    FOR EACH ROW
    EXECUTE FUNCTION trg_evento_auth_inmutable();

-- 20.3) RN-007: no dos versiones activas de la misma app en el mismo lab.
--      Se implementa con un índice único parcial que involucra APLICACION.version.
--      Para eso desnormalizamos "version" en VINCULO_APP_LAB mediante una función.
ALTER TABLE vinculo_app_lab ADD COLUMN version VARCHAR(32);
ALTER TABLE vinculo_app_lab ADD COLUMN app_nombre VARCHAR(128);
ALTER TABLE vinculo_app_lab ALTER COLUMN app_nombre SET NOT NULL;

CREATE OR REPLACE FUNCTION trg_vinculo_sync_version()
RETURNS TRIGGER AS $$
BEGIN
    SELECT version, nombre INTO NEW.version, NEW.app_nombre
    FROM aplicacion WHERE id = NEW.app_id;
    IF NEW.version IS NULL THEN
        RAISE EXCEPTION 'APLICACION no existe o no tiene versión.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_vinculo_sync_version
    BEFORE INSERT OR UPDATE OF app_id ON vinculo_app_lab
    FOR EACH ROW
    EXECUTE FUNCTION trg_vinculo_sync_version();

-- RN-007: una sola versión activa de la misma app (identificada por nombre)
-- por laboratorio. Las versiones históricas inactivas no tienen límite.
CREATE UNIQUE INDEX ux_vinculo_app_lab_activo
    ON vinculo_app_lab (lower(app_nombre), laboratorio_id)
    WHERE activo = TRUE;

-- =====================================================================
-- 20) COMENTARIOS (opcional, ayuda a documentar el esquema)
-- =====================================================================
COMMENT ON TABLE usuario            IS 'Usuarios del dominio Samba AD (RF-001, HU-COM-02)';
COMMENT ON TABLE grupo              IS 'Grupos de estudiantes sincronizados con Samba AD (RF-006, HU-COM-05)';
COMMENT ON TABLE membresia_grupo    IS 'Pertenencia estudiante-grupo (RN-012)';
COMMENT ON TABLE asignacion_docente IS 'Asignación de docentes a grupos para monitoreo (RN-017)';
COMMENT ON TABLE laboratorio        IS 'Laboratorios informáticos (RF-002, HU-COM-03)';
COMMENT ON TABLE equipo             IS 'Equipos de cada laboratorio (RF-003, HU-COM-04)';
COMMENT ON TABLE sesion_activa      IS 'Sesiones activas para monitoreo docente (RF-014, RN-020)';
COMMENT ON TABLE aplicacion         IS 'Catálogo de aplicaciones e instaladores (RF-004, HU-COM-07)';
COMMENT ON TABLE vinculo_app_lab    IS 'Vinculación app-laboratorio (RF-005, RN-002, RN-007)';
COMMENT ON TABLE permiso_app_grupo  IS 'Permisos de aplicación por grupo (RF-009, RN-008, RN-013)';
COMMENT ON TABLE despliegue         IS 'Despliegues remotos masivos (RF-011, RF-012, HU-COM-08)';
COMMENT ON TABLE despliegue_equipo  IS 'Estado por equipo dentro de un despliegue (RF-017, RN-006)';
COMMENT ON TABLE lista_blanca_url   IS 'Listas blancas de URLs por grupo (RF-010, RN-016)';
COMMENT ON TABLE politica_ejecucion IS 'Políticas de ejecución AppLocker/GPO (RN-009)';
COMMENT ON TABLE config_filtrado    IS 'Configuración de filtrado Squid/SquidGuard (RN-016)';
COMMENT ON TABLE auditoria          IS 'Auditoría inmutable de acciones críticas (RF-019, RNF-020)';
COMMENT ON TABLE archivo_academico  IS 'Repositorio académico centralizado (RF-016, HU-COM-11)';
COMMENT ON TABLE sesion_web         IS 'Sesiones web revocables asociadas al JWT (HU-COM-14, CA-03/10/11)';
COMMENT ON TABLE evento_autenticacion IS 'Auditoría append-only de login, logout, fallos y accesos denegados (HU-COM-14, CA-12/14)';
