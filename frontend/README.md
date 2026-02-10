# SISCONT Frontend

Frontend moderno del Sistema Contable Peruano desarrollado con React, TypeScript y Tailwind CSS.

## 🚀 Características

- ⚡ **Vite** - Build tool ultra-rápido
- ⚛️ **React 18** - Framework UI moderno
- 📘 **TypeScript** - Tipado estático
- 🎨 **Tailwind CSS** - Utility-first CSS
- 🎯 **Lucide Icons** - Iconografía moderna
- 🧩 **React Router** - Navegación SPA
- 🗄️ **Zustand** - State management ligero

## 📦 Instalación

```bash
npm install
```

## 🛠️ Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 🏗️ Build

```bash
npm run build
```

Genera los archivos estáticos en `dist/`

## 🎨 UI Moderna

Ver [README_IMPROVEMENTS.md](./README_IMPROVEMENTS.md) para detalles completos de las mejoras de UI implementadas.

### Componentes Disponibles

- **Button** - Botones con variantes y tamaños
- **Card** - Tarjetas con header y contenido
- **Table** - Tablas responsive con estilos modernos

### Páginas

- `/login` - Autenticación
- `/` - Dashboard con métricas
- `/empresas` - Gestión de empresas
- `/plan` - Plan de cuentas (PCGE)
- `/diarios` - Diarios y asientos
- `/compras` - Registro de compras
- `/ventas` - Registro de ventas
- `/reportes` - Reportes financieros
- `/ple` - Libros electrónicos

## 🔧 Configuración

### Variables de Entorno

Crea un archivo `.env.development`:

```env
VITE_API_BASE=http://localhost:8000/api
```

### Proxy de Desarrollo

El `vite.config.ts` está configurado para hacer proxy de `/api` al backend en desarrollo.

## 📝 Estructura

```
src/
├── components/      # Componentes reutilizables
│   ├── ui/         # Componentes UI base
│   └── AuthGuard.tsx
├── layouts/        # Layouts de página
├── pages/          # Páginas de la aplicación
├── stores/         # Estado global (Zustand)
├── lib/            # Utilidades
├── api.ts          # Cliente API
└── main.tsx        # Punto de entrada
```

## 🎯 Próximos Pasos

- [ ] Integración con backend real
- [ ] Formularios de creación/edición
- [ ] Validación de formularios
- [ ] Notificaciones toast
- [ ] Gráficos y visualizaciones
- [ ] Modales y diálogos
- [ ] Paginación
- [ ] Dark mode

## 📄 Licencia

Ver archivo LICENSE

