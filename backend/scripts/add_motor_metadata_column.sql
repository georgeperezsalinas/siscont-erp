-- Script SQL directo para agregar columna motor_metadata a journal_entries
-- Ejecutar este script si la migración de Alembic no funciona

-- Para PostgreSQL:
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS motor_metadata JSON;

-- Para SQLite (si es necesario):
-- ALTER TABLE journal_entries ADD COLUMN motor_metadata TEXT;

