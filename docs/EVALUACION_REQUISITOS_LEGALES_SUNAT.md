# Evaluación de Requisitos Legales SUNAT para SISCONT

**Fecha de Evaluación:** Enero 2025  
**Sistema:** SISCONT - Sistema Contable Integrado  
**Normativa Vigente:** Resoluciones SUNAT, PCGE, NIIF, SIRE

---

## Resumen Ejecutivo

Esta evaluación analiza el cumplimiento de SISCONT con los requisitos legales y normativos vigentes en Perú, identificando las brechas y proponiendo un plan de implementación priorizado.

**Estado General:** ⚠️ **Parcialmente Cumplido** - El sistema tiene una base sólida pero requiere implementaciones críticas para cumplir con normativas recientes, especialmente SIRE.

---

## 1. Sistema Integrado de Registros Electrónicos (SIRE)

### 📋 Requisitos Legales

**Normativa:** Resolución de Superintendencia N° 000021-2024/SUNAT  
**Plazo Obligatorio:** Enero 2026 (extendido para muchos contribuyentes)  
**Estado Crítico:** 🔴 **ALTA PRIORIDAD**

#### Funcionalidades Requeridas:

1. **Gestión de Propuestas de Ventas (RVIE)**
   - Importar propuestas generadas automáticamente por SUNAT
   - Validar estructura y datos de las propuestas
   - Aceptar, complementar o reemplazar propuestas

2. **Gestión de Propuestas de Compras (RCE)**
   - Importar propuestas de compras desde SUNAT
   - Validar información de proveedores y documentos
   - Procesar aceptaciones y modificaciones

3. **Integración con SUNAT**
   - API REST para comunicación con SUNAT
   - Autenticación OAuth 2.0
   - Manejo de tokens y renovación automática
   - Sincronización bidireccional

4. **Plazos y Alertas**
   - Notificaciones de propuestas pendientes
   - Recordatorios de plazos de respuesta
   - Historial de operaciones SIRE

### ✅ Estado Actual en SISCONT

| Funcionalidad | Estado | Observaciones |
|--------------|--------|---------------|
| Importación de propuestas | ❌ No implementado | Requiere desarrollo completo |
| Validación de propuestas | ❌ No implementado | Necesita estructura de datos SIRE |
| Integración API SUNAT | ❌ No implementado | Requiere configuración OAuth y endpoints |
| Gestión de RVIE/RCE | ❌ No implementado | Módulo completo por desarrollar |
| Alertas y plazos | ❌ No implementado | Sistema de notificaciones necesario |

### 🎯 Plan de Implementación SIRE

#### Fase 1: Infraestructura Base (2-3 semanas)
- [ ] Configuración de autenticación OAuth 2.0 con SUNAT
- [ ] Cliente API para comunicación con endpoints SIRE
- [ ] Modelos de datos para propuestas (RVIE, RCE)
- [ ] Tablas de base de datos: `sire_proposals`, `sire_responses`, `sire_sync_log`

#### Fase 2: Gestión de Propuestas (3-4 semanas)
- [ ] Endpoint para recibir propuestas desde SUNAT (webhook)
- [ ] Parser de archivos XML/JSON de propuestas
- [ ] Validación de estructura y datos
- [ ] Interfaz de usuario para revisar y gestionar propuestas
- [ ] Funcionalidad de aceptar/complementar/reemplazar

#### Fase 3: Sincronización y Alertas (2 semanas)
- [ ] Sincronización automática periódica
- [ ] Sistema de notificaciones de propuestas pendientes
- [ ] Dashboard de estado SIRE
- [ ] Reportes de cumplimiento

**Prioridad:** 🔴 **CRÍTICA** - Implementar antes de enero 2026

---

## 2. Estructura Contable y Normativa

### 📋 Requisitos Legales

**Normativa:** PCGE (Plan Contable General Empresarial) - Versión Modificada  
**NIIF:** Normas Internacionales de Información Financiera  
**Contabilidad Completa:** Obligatoria para ingresos > 1700 UIT

#### Funcionalidades Requeridas:

1. **PCGE Modificado**
   - Estructura de hasta 5 dígitos
   - Cuentas según clasificación PCGE vigente
   - Validación de estructura jerárquica

2. **NIIF Compliance**
   - Reconocimiento de ingresos y gastos según NIIF
   - Valoración de activos y pasivos
   - Presentación de estados financieros

3. **Libro Caja y Bancos**
   - Registro detallado de movimientos bancarios
   - Conciliación bancaria obligatoria
   - Reportes de flujo de efectivo

### ✅ Estado Actual en SISCONT

| Funcionalidad | Estado | Observaciones |
|--------------|--------|---------------|
| Estructura PCGE | ✅ Implementado | Sistema usa PCGE peruano, estructura de cuentas correcta |
| Cuentas 5 dígitos | ✅ Implementado | El sistema permite códigos flexibles |
| Libro Diario | ✅ Implementado | Generación automática de asientos |
| Libro Mayor | ✅ Implementado | Disponible en reportes |
| Libro Caja y Bancos | ⚠️ Parcial | Existe conciliación bancaria, pero requiere validación NIIF |
| NIIF Compliance | ⚠️ Parcial | Estructura base existe, falta validación específica NIIF |

### 🎯 Plan de Mejora Estructura Contable

#### Mejoras Necesarias:

1. **Validación PCGE Estricta** (1 semana)
   - [ ] Validar estructura jerárquica de cuentas
   - [ ] Verificar códigos según catálogo oficial PCGE
   - [ ] Validación de niveles (1-5 dígitos)

2. **NIIF Compliance** (3-4 semanas)
   - [ ] Módulo de reconocimiento de ingresos según NIIF 15
   - [ ] Valoración de inventarios según NIIF 2
   - [ ] Presentación de estados financieros NIIF
   - [ ] Notas a los estados financieros

3. **Libro Caja y Bancos Mejorado** (2 semanas)
   - [ ] Validación de formato según normativa
   - [ ] Reportes de flujo de efectivo (NIIF 7)
   - [ ] Exportación para PLE/SIRE

**Prioridad:** 🟡 **MEDIA-ALTA** - Mejoras incrementales

---

## 3. Facturación Electrónica (CPE)

### 📋 Requisitos Legales

**Normativa:** Resolución de Superintendencia N° 007-019/SUNAT  
**Formato:** UBL 2.1 (XML) con firma digital  
**Validación:** A través de SUNAT u OSE autorizado

#### Funcionalidades Requeridas:

1. **Emisión de Comprobantes**
   - Facturas electrónicas (01)
   - Boletas de venta (03)
   - Notas de crédito (07)
   - Notas de débito (08)
   - Comprobantes de retención y percepción

2. **Formato UBL 2.1**
   - Generación de XML según estándar UBL 2.1
   - Firma digital con certificado digital
   - Validación de estructura antes de envío

3. **Integración con OSE/SUNAT**
   - Envío a SUNAT o OSE autorizado
   - Recepción de CDR (Constancia de Recepción)
   - Manejo de observaciones y rechazos
   - Reenvío de comprobantes

4. **Almacenamiento y Consulta**
   - Repositorio de comprobantes emitidos
   - Consulta de estado en SUNAT
   - Descarga de PDF y XML

### ✅ Estado Actual en SISCONT

| Funcionalidad | Estado | Observaciones |
|--------------|--------|---------------|
| Registro de ventas/compras | ✅ Implementado | Sistema registra facturas y boletas |
| Generación XML UBL 2.1 | ❌ No implementado | Requiere desarrollo completo |
| Firma digital | ❌ No implementado | Integración con certificados digitales |
| Envío a SUNAT/OSE | ❌ No implementado | API de facturación electrónica |
| Recepción CDR | ❌ No implementado | Procesamiento de respuestas |
| Consulta de estado | ❌ No implementado | Integración con consulta SUNAT |

### 🎯 Plan de Implementación CPE

#### Fase 1: Generación UBL 2.1 (4-5 semanas)
- [ ] Librería para generación de XML UBL 2.1
- [ ] Plantillas para cada tipo de comprobante
- [ ] Validación de estructura XML
- [ ] Generación de PDF desde XML

#### Fase 2: Firma Digital (2-3 semanas)
- [ ] Integración con certificados digitales
- [ ] Firma XML según estándar XAdES
- [ ] Validación de certificados
- [ ] Renovación automática de certificados

#### Fase 3: Integración SUNAT/OSE (3-4 semanas)
- [ ] Cliente API para facturación electrónica
- [ ] Envío de comprobantes
- [ ] Recepción y procesamiento de CDR
- [ ] Manejo de errores y observaciones
- [ ] Reenvío automático

#### Fase 4: Gestión y Consulta (2 semanas)
- [ ] Repositorio de comprobantes
- [ ] Consulta de estado en SUNAT
- [ ] Dashboard de facturación
- [ ] Reportes de emisión

**Prioridad:** 🔴 **CRÍTICA** - Requisito obligatorio para emisión

**Nota:** Considerar integración con OSE existente (ej: Nubefact, Facturador Electrónico) como alternativa más rápida.

---

## 4. Libros y Registros Obligatorios

### 📋 Requisitos Legales

**Normativa:** Resolución de Superintendencia N° 234-2006/SUNAT  
**PLE:** Programa de Libros Electrónicos  
**SIRE:** Sistema Integrado de Registros Electrónicos (nuevo)

#### Funcionalidades Requeridas:

1. **Libro Diario**
   - Registro cronológico de asientos
   - Formato PLE compatible
   - Exportación para SIRE

2. **Libro Mayor**
   - Movimientos por cuenta
   - Saldos acumulados
   - Formato PLE compatible

3. **Libro de Inventario y Cuentas Anuales**
   - Balance general
   - Estado de resultados
   - Formato PLE compatible

4. **Registro de Compras (PLE 8.1)**
   - Formato TXT con delimitador |
   - Estructura según catálogo SUNAT
   - Validación antes de exportación

5. **Registro de Ventas (PLE 8.2)**
   - Formato TXT con delimitador |
   - Estructura según catálogo SUNAT
   - Validación antes de exportación

### ✅ Estado Actual en SISCONT

| Funcionalidad | Estado | Observaciones |
|--------------|--------|---------------|
| Libro Diario | ✅ Implementado | Generación automática, formato visual |
| Libro Mayor | ✅ Implementado | Disponible en reportes |
| Exportación PLE Diario | ⚠️ Parcial | Estructura básica, requiere validación completa |
| Exportación PLE Compras | ⚠️ Parcial | Función `ple_compras` existe pero simplificada |
| Exportación PLE Ventas | ⚠️ Parcial | Función `ple_ventas` existe pero simplificada |
| Validación PLE | ❌ No implementado | Validación de estructura y catálogos |
| Integración SIRE | ❌ No implementado | Requiere módulo SIRE completo |

### 🎯 Plan de Mejora Libros Electrónicos

#### Mejoras Necesarias:

1. **Completar PLE Compras/Ventas** (2-3 semanas)
   - [ ] Implementar estructura completa según catálogo SUNAT
   - [ ] Incluir todos los campos requeridos
   - [ ] Validación de datos antes de exportación
   - [ ] Generación de archivo TXT con formato correcto

2. **Validación PLE** (1-2 semanas)
   - [ ] Validación de catálogos SUNAT (06, 07, etc.)
   - [ ] Verificación de estructura de datos
   - [ ] Reporte de errores antes de exportación

3. **Integración SIRE** (Ver sección 1)
   - [ ] Exportación directa a SIRE
   - [ ] Sincronización automática
   - [ ] Validación en tiempo real

**Prioridad:** 🟡 **MEDIA-ALTA** - Mejorar implementación existente

---

## 5. Nuevas Facultades de Fiscalización

### 📋 Requisitos Legales

**Normativa:** Ley N° 31122 (diciembre 2024)  
**Facultad:** Acceso remoto a sistemas de procesamiento electrónico  
**Vigencia:** Desde diciembre 2025

#### Consideraciones:

1. **Seguridad y Acceso**
   - Auditoría de accesos
   - Registro de operaciones
   - Control de permisos

2. **Preparación para Fiscalización**
   - Exportación rápida de información
   - Reportes de cumplimiento
   - Trazabilidad de operaciones

3. **Cumplimiento de Estándares**
   - Seguridad de datos
   - Integridad de información
   - Disponibilidad de registros

### ✅ Estado Actual en SISCONT

| Funcionalidad | Estado | Observaciones |
|--------------|--------|---------------|
| Auditoría de accesos | ⚠️ Parcial | Sistema de usuarios y permisos existe |
| Registro de operaciones | ⚠️ Parcial | Logs básicos, requiere mejora |
| Exportación de datos | ✅ Implementado | Exportación a Excel/PDF disponible |
| Trazabilidad | ⚠️ Parcial | IDs de asientos, requiere auditoría completa |
| Seguridad de datos | ✅ Implementado | Autenticación y autorización |

### 🎯 Plan de Preparación Fiscalización

#### Mejoras Necesarias:

1. **Sistema de Auditoría Completo** (2-3 semanas)
   - [ ] Registro de todas las operaciones críticas
   - [ ] Logs de accesos y modificaciones
   - [ ] Reportes de auditoría
   - [ ] Inmutabilidad de registros contables

2. **Exportación para Fiscalización** (1 semana)
   - [ ] Exportación masiva de información
   - [ ] Formato estándar para SUNAT
   - [ ] Reportes de cumplimiento

3. **Documentación de Cumplimiento** (1 semana)
   - [ ] Manual de procedimientos
   - [ ] Documentación de controles
   - [ ] Evidencias de cumplimiento

**Prioridad:** 🟢 **MEDIA** - Preparación preventiva

---

## Plan de Implementación Priorizado

### 🔴 Fase Crítica (Q1 2025 - Antes de Enero 2026)

1. **SIRE - Sistema Integrado de Registros Electrónicos**
   - Tiempo estimado: 8-10 semanas
   - Recursos: 2-3 desarrolladores
   - Dependencias: API SUNAT, autenticación OAuth

2. **Facturación Electrónica (CPE) - Básica**
   - Tiempo estimado: 10-12 semanas (o integración con OSE: 2-3 semanas)
   - Recursos: 2-3 desarrolladores
   - Alternativa: Integración con OSE existente (más rápido)

### 🟡 Fase Alta Prioridad (Q2-Q3 2025)

3. **Completar PLE Compras/Ventas**
   - Tiempo estimado: 3-4 semanas
   - Recursos: 1 desarrollador

4. **NIIF Compliance - Básico**
   - Tiempo estimado: 4-5 semanas
   - Recursos: 1 desarrollador + consultor contable

### 🟢 Fase Media Prioridad (Q4 2025)

5. **Sistema de Auditoría Completo**
   - Tiempo estimado: 3 semanas
   - Recursos: 1 desarrollador

6. **Mejoras NIIF Avanzadas**
   - Tiempo estimado: 4-6 semanas
   - Recursos: 1 desarrollador + consultor

---

## Recomendaciones Estratégicas

### 1. **SIRE - Enfoque Prioritario**
- **Acción Inmediata:** Iniciar desarrollo de módulo SIRE
- **Consideración:** Evaluar integración con proveedores especializados
- **Riesgo:** No cumplir con plazo de enero 2026

### 2. **Facturación Electrónica - Decisión Estratégica**
- **Opción A:** Desarrollo propio (10-12 semanas, mayor control)
- **Opción B:** Integración con OSE (2-3 semanas, dependencia externa)
- **Recomendación:** Opción B para lanzamiento rápido, Opción A para largo plazo

### 3. **PLE - Mejora Incremental**
- **Acción:** Completar funciones existentes
- **Prioridad:** Media-Alta (requisito actual)
- **Riesgo:** Bajo (ya existe base)

### 4. **NIIF - Enfoque Gradual**
- **Acción:** Implementar requisitos básicos primero
- **Consideración:** Consultoría especializada necesaria
- **Prioridad:** Media (mejora continua)

---

## Matriz de Cumplimiento

| Requisito | Estado Actual | Prioridad | Tiempo Estimado | Riesgo |
|-----------|---------------|-----------|-----------------|--------|
| SIRE | ❌ No implementado | 🔴 Crítica | 8-10 semanas | Alto |
| CPE (Facturación) | ❌ No implementado | 🔴 Crítica | 10-12 semanas | Alto |
| PLE Completar | ⚠️ Parcial | 🟡 Media-Alta | 3-4 semanas | Medio |
| NIIF Básico | ⚠️ Parcial | 🟡 Media | 4-5 semanas | Bajo |
| Auditoría | ⚠️ Parcial | 🟢 Media | 3 semanas | Bajo |
| PCGE | ✅ Implementado | - | - | - |
| Libro Diario | ✅ Implementado | - | - | - |

---

## Conclusión

SISCONT tiene una **base sólida** en estructura contable y generación de reportes, pero requiere **implementaciones críticas** para cumplir con normativas recientes:

1. **SIRE** es la prioridad absoluta - plazo enero 2026
2. **Facturación Electrónica** es crítica para emisión de comprobantes
3. **PLE** requiere completar implementación existente
4. **NIIF** y **Auditoría** son mejoras incrementales

**Recomendación Final:** Enfocar recursos en SIRE y CPE en los próximos 6 meses, con mejoras incrementales en PLE y NIIF.

---

**Documento preparado por:** Sistema de Evaluación SISCONT  
**Última actualización:** Enero 2025  
**Próxima revisión:** Trimestral

