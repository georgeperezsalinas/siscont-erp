# Índice General de Documentación SISCONT

## Sistema Contable Peruano - Guía de Navegación

**Última actualización:** Febrero 2026 | **Total: 20 documentos .md + 1 PDF**

> Los documentos han sido revisados y actualizados para reflejar el estado real del sistema (conciliación completa, mejoras UX implementadas, etc.).

---

## Documentos Principales

| Documento | Descripción |
|-----------|-------------|
| [ESTADO_SITUACIONAL_PROYECTO.md](ESTADO_SITUACIONAL_PROYECTO.md) | **Estado situacional**: qué está al 100% y qué falta |
| [DOCUMENTACION_SISTEMA_SISCONT.md](DOCUMENTACION_SISTEMA_SISCONT.md) | Arquitectura, instalación, módulos, API, despliegue |
| [MANUAL_USUARIO_SISCONT.md](MANUAL_USUARIO_SISCONT.md) | Manual de usuario paso a paso |
| [RESUMEN_TECNICO_SISCONT.md](RESUMEN_TECNICO_SISCONT.md) | Stack, modelo de datos, reglas de negocio |
| [ESTADO_MODULOS_SISCONT.md](ESTADO_MODULOS_SISCONT.md) | Estado de implementación por módulo |

---

## Por Tema

### Contabilidad
- [GUIA_MOTOR_ASIENTOS.md](GUIA_MOTOR_ASIENTOS.md) - Motor de asientos: eventos, reglas, mapeos, planillas
- [MODULO_ASIENTOS_MANUALES.md](MODULO_ASIENTOS_MANUALES.md) - Estados DRAFT/POSTED, validaciones, endpoints
- [REGLAS_Y_VALIDACIONES_CONTABLES.md](REGLAS_Y_VALIDACIONES_CONTABLES.md) - Reglas de validación y anulación

### Conciliación
- [GUIA_CONCILIACION_BANCARIA.md](GUIA_CONCILIACION_BANCARIA.md) - Configuración, cargar extracto, historial, reversión

### SIRE
- [GUIA_SIRE.md](GUIA_SIRE.md) - Credenciales OAuth, configuración, multiempresa, troubleshooting

### Gestión Documental
- [GUIA_GESTION_DOCUMENTAL.md](GUIA_GESTION_DOCUMENTAL.md) - Arquitectura, upload, OCR, ajustes aplicados

### Administración y Mejoras
- [ADMINISTRACION_SAP_STYLE.md](ADMINISTRACION_SAP_STYLE.md) - Estructura de menús
- [MEJORAS_UX_SAP.md](MEJORAS_UX_SAP.md) - Plan de mejoras UX
- [MEJORAS_IMPLEMENTADAS_Y_PENDIENTES.md](MEJORAS_IMPLEMENTADAS_Y_PENDIENTES.md) - Funcionalidades y código pendiente

### Infraestructura
- [ESTRATEGIA_VOLUMENES_DOCKER.md](ESTRATEGIA_VOLUMENES_DOCKER.md) - Volúmenes Docker
- [EVALUACION_REQUISITOS_LEGALES_SUNAT.md](EVALUACION_REQUISITOS_LEGALES_SUNAT.md) - Requisitos legales

### Otros
- [GUIA_EVENTOS_TESORERIA.md](GUIA_EVENTOS_TESORERIA.md) - Eventos de tesorería
- [QA_PLAN_PRUEBAS_AUTOMATIZADAS.md](QA_PLAN_PRUEBAS_AUTOMATIZADAS.md) - Plan de pruebas
- [DATOS_PRUEBA_FUNCIONAL.md](DATOS_PRUEBA_FUNCIONAL.md) - Datos de prueba
- Manual SIRE Compras v22.pdf - Documentación oficial SUNAT

---

## Lectura Recomendada

**Desarrolladores:** DOCUMENTACION_SISTEMA → RESUMEN_TECNICO → ESTADO_MODULOS  
**Usuarios:** MANUAL_USUARIO → GUIA_MOTOR_ASIENTOS (si aplica)  
**SIRE:** GUIA_SIRE  
**Conciliación:** GUIA_CONCILIACION_BANCARIA
