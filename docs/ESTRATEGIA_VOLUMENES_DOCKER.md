# Estrategia de Volúmenes Persistentes - SISCONT

## Objetivo

Garantizar que **todos los datos** (base de datos, documentos, uploads, logs) estén almacenados **fuera del contenedor Docker** mediante volúmenes persistentes. Esto permite:

- ✅ Actualizar el sistema sin perder datos
- ✅ Reconstruir contenedores sin afectar información
- ✅ Facilitar backups y recuperación
- ✅ Mejor rendimiento (volúmenes montados)
- ✅ Separación clara entre código y datos

---

## Estructura de Volúmenes

### Volúmenes Docker (Recomendado)

```yaml
volumes:
  pgdata:                    # Base de datos PostgreSQL
  siscont_data:              # Todos los datos de la aplicación
    - data/documents/        # Documentos digitalizados
    - data/uploads/          # Archivos subidos (fotos, etc.)
    - data/siscont.db        # SQLite (si se usa como alternativa)
    - logs/                  # Logs de la aplicación
```

### Ventajas de Volúmenes Docker
- **Persistencia**: Los datos sobreviven a `docker-compose down`
- **Backup**: Fácil backup con `docker volume inspect`
- **Portabilidad**: Volúmenes pueden moverse entre hosts
- **Rendimiento**: Mejor que bind mounts en algunos casos

---

## Configuración Actualizada

### docker-compose.yml (Raíz)

```yaml
version: '3.9'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: siscont
      POSTGRES_USER: siscont
      POSTGRES_PASSWORD: s1scont
    volumes:
      - pgdata:/var/lib/postgresql/data  # ✅ Base de datos persistente
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U siscont -d siscont"]
      interval: 5s
      timeout: 5s
      retries: 10
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql+psycopg://siscont:s1scont@db:5432/siscont
      - UPLOADS_DIR=/app/data/uploads
      - DOCUMENTS_DIR=/app/data/documents
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8000:8000"
    volumes:
      # ✅ Volumen persistente para TODOS los datos
      - siscont_data:/app/data
      # Opcional: Montar código en desarrollo (hot reload)
      # - ./backend:/app  # Descomentar solo en desarrollo

  frontend:
    image: nginx:1.27-alpine
    depends_on:
      - backend
    ports:
      - "5173:80"
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  pgdata:
    # Volumen persistente para base de datos PostgreSQL
    # Ubicación: /var/lib/docker/volumes/siscont_pro_pgdata/_data
  
  siscont_data:
    # Volumen persistente para datos de la aplicación
    # Contiene:
    #   - data/documents/     (documentos digitalizados)
    #   - data/uploads/      (fotos de perfil, etc.)
    #   - data/siscont.db    (SQLite si se usa)
    #   - logs/              (logs de aplicación)
    # Ubicación: /var/lib/docker/volumes/siscont_pro_siscont_data/_data
```

---

## Alternativa: Bind Mounts (Desarrollo)

Si prefieres ver los archivos directamente en el sistema host:

```yaml
backend:
  volumes:
    # Bind mount: Los archivos aparecen en ./data/ del proyecto
    - ./data:/app/data
    # PostgreSQL sigue usando volumen (recomendado)
```

**Ventajas:**
- Fácil acceso a archivos desde el host
- Útil para desarrollo y debugging

**Desventajas:**
- Depende de permisos del sistema host
- Puede ser más lento en algunos sistemas

---

## Estructura de Directorios Dentro del Volumen

```
/app/data/                    # Montado desde siscont_data
├── documents/                # Documentos digitalizados
│   └── {company_id}/
│       └── {year}/
│           └── {month}/
│               └── {document_id}_{uuid}.{ext}
├── uploads/                  # Archivos subidos
│   └── profiles/            # Fotos de perfil
│       └── {user_id}_{uuid}.{ext}
├── siscont.db                # SQLite (si se usa como alternativa)
└── logs/                     # Logs de aplicación
    └── siscont_YYYY-MM-DD.log
```

---

## Comandos Útiles

### Ver Volúmenes
```bash
docker volume ls
docker volume inspect siscont_pro_siscont_data
```

### Backup de Volumen
```bash
# Backup del volumen de datos
docker run --rm \
  -v siscont_pro_siscont_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/siscont_data_$(date +%Y%m%d).tar.gz -C /data .

# Backup de base de datos
docker run --rm \
  -v siscont_pro_pgdata:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/pgdata_$(date +%Y%m%d).tar.gz -C /data .
```

### Restaurar Volumen
```bash
# Restaurar datos
docker run --rm \
  -v siscont_pro_siscont_data:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/siscont_data_YYYYMMDD.tar.gz"
```

### Limpiar Volúmenes (¡CUIDADO!)
```bash
# Eliminar volumen (¡PERDERÁS TODOS LOS DATOS!)
docker volume rm siscont_pro_siscont_data

# Limpiar volúmenes no usados
docker volume prune
```

### Acceder a Archivos del Volumen
```bash
# Crear contenedor temporal para acceder a archivos
docker run --rm -it \
  -v siscont_pro_siscont_data:/data \
  alpine sh

# Dentro del contenedor:
cd /data
ls -la
```

---

## Migración desde Sistema Actual

Si ya tienes datos en `./data/` y quieres migrarlos a volúmenes:

### Paso 1: Detener Contenedores
```bash
docker-compose down
```

### Paso 2: Crear Volumen y Copiar Datos
```bash
# Crear volumen
docker volume create siscont_pro_siscont_data

# Copiar datos existentes al volumen
docker run --rm \
  -v $(pwd)/data:/source \
  -v siscont_pro_siscont_data:/target \
  alpine sh -c "cp -r /source/* /target/"
```

### Paso 3: Actualizar docker-compose.yml
Ya está actualizado con los volúmenes.

### Paso 4: Iniciar Contenedores
```bash
docker-compose up -d
```

---

## Configuración para Producción

### Opción 1: Volúmenes Docker (Recomendado)
- ✅ Simple y robusto
- ✅ Backup fácil
- ✅ Portabilidad

### Opción 2: Bind Mounts a Directorio Específico
```yaml
volumes:
  - /var/siscont/data:/app/data  # Ruta absoluta en el host
```

**Ventajas:**
- Control total sobre ubicación
- Fácil acceso para backups externos

### Opción 3: NFS/Network Storage
Para sistemas distribuidos o alta disponibilidad:
```yaml
volumes:
  - nfs_share:/app/data
```

---

## Variables de Entorno

Actualizar `.env` o configuración:

```bash
# Backend
UPLOADS_DIR=/app/data/uploads
DOCUMENTS_DIR=/app/data/documents
LOG_DIR=/app/logs

# Base de datos (ya configurado)
DATABASE_URL=postgresql+psycopg://siscont:s1scont@db:5432/siscont
```

---

## Verificación

### Verificar que los Volúmenes Funcionan

1. **Subir un archivo** (foto de perfil o documento)
2. **Detener contenedores**: `docker-compose down`
3. **Eliminar contenedores**: `docker-compose rm`
4. **Reconstruir**: `docker-compose up -d --build`
5. **Verificar**: El archivo debe seguir existiendo

### Verificar Ubicación de Volúmenes

```bash
# Linux
docker volume inspect siscont_pro_siscont_data
# Output: "Mountpoint": "/var/lib/docker/volumes/siscont_pro_siscont_data/_data"

# Windows (Docker Desktop)
# Los volúmenes están en: \\wsl$\docker-desktop-data\data\docker\volumes\
```

---

## Consideraciones de Seguridad

### Permisos
- Los archivos dentro del volumen heredan permisos del contenedor
- Asegurar que el usuario del contenedor tenga permisos adecuados

### Encriptación
- Para datos sensibles, considerar encriptación del volumen
- Docker soporta volúmenes encriptados (requiere configuración adicional)

### Backup Automático
- Configurar backups regulares de los volúmenes
- Considerar scripts de backup automático (cron, systemd timers)

---

## Resumen

✅ **Base de datos PostgreSQL**: Ya usa volumen persistente (`pgdata`)  
✅ **Datos de aplicación**: Ahora usa volumen persistente (`siscont_data`)  
✅ **Documentos**: Se almacenan en `siscont_data/data/documents/`  
✅ **Uploads**: Se almacenan en `siscont_data/data/uploads/`  
✅ **Logs**: Se almacenan en `siscont_data/logs/`  

**Resultado**: Todos los datos están fuera del contenedor y persisten entre actualizaciones.

---

## Próximos Pasos

1. ✅ Actualizar `docker-compose.yml` (ya hecho)
2. ⏳ Probar con datos de prueba
3. ⏳ Configurar backups automáticos
4. ⏳ Documentar procedimiento de restauración

