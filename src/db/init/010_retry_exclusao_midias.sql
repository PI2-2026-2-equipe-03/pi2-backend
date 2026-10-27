BEGIN;
ALTER TABLE media_deletion_job
    ADD COLUMN tentativas SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN proxima_tentativa_em TIMESTAMPTZ;
COMMIT;