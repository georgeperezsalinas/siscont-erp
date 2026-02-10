import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import LoginPage from '@/pages/Login'
import AppLayout from '@/layouts/AppLayout'
import AuthGuard from '@/components/AuthGuard'
import Dashboard from '@/pages/Dashboard'
import Empresas from '@/pages/Empresas'
import Usuarios from '@/pages/Usuarios'
import Permisos from '@/pages/Permisos'
import Plan from '@/pages/Plan'
import Periodos from '@/pages/Periodos'
import Asientos from '@/pages/Asientos'
import Diarios from '@/pages/Diarios'
import Compras from '@/pages/Compras'
import Ventas from '@/pages/Ventas'
import Inventarios from '@/pages/Inventarios'
import Reportes from '@/pages/Reportes'
import PLE from '@/pages/PLE'
import SIRE from '@/pages/SIRE'
import ConciliacionBancaria from '@/pages/ConciliacionBancaria'
import MiPerfil from '@/pages/MiPerfil'
import MantenimientoDatos from '@/pages/MantenimientoDatos'
import ValidacionDatos from '@/pages/ValidacionDatos'
import Terceros from '@/pages/Terceros'
import Configuracion from '@/pages/Configuracion'
import MotorAsientos from '@/pages/MotorAsientos'
import Tesoreria from '@/pages/Tesoreria'
import Notas from '@/pages/Notas'
import CasillaElectronica from '@/pages/CasillaElectronica'
import './index.css'

// Inicializar tema al cargar la app
const savedTheme = localStorage.getItem('siscont-theme') || 'light'
document.documentElement.classList.remove('light', 'dark')
document.documentElement.classList.add(savedTheme)

const router = createBrowserRouter([
  { path:'/login', element:<LoginPage/> },
  { element:<AuthGuard/>, children: [
    { path:'/', element:<AppLayout><Dashboard/></AppLayout> },
    { path:'/empresas', element:<AppLayout><Empresas/></AppLayout> },
    { path:'/usuarios', element:<AppLayout><Usuarios/></AppLayout> },
    { path:'/permisos', element:<AppLayout><Permisos/></AppLayout> },
    { path:'/plan', element:<AppLayout><Plan/></AppLayout> },
    { path:'/periodos', element:<AppLayout><Periodos/></AppLayout> },
    { path:'/asientos', element:<AppLayout><Asientos/></AppLayout> },
    { path:'/diarios', element:<AppLayout><Diarios/></AppLayout> },
    { path:'/terceros', element:<AppLayout><Terceros/></AppLayout> },
    { path:'/compras', element:<AppLayout><Compras/></AppLayout> },
    { path:'/ventas', element:<AppLayout><Ventas/></AppLayout> },
    { path:'/tesoreria', element:<AppLayout><Tesoreria/></AppLayout> },
    { path:'/inventarios', element:<AppLayout><Inventarios/></AppLayout> },
    { path:'/notas', element:<AppLayout><Notas/></AppLayout> },
    { path:'/casilla-electronica', element:<AppLayout><CasillaElectronica/></AppLayout> },
    { path:'/reportes', element:<AppLayout><Reportes/></AppLayout> },
    { path:'/ple', element:<AppLayout><PLE/></AppLayout> },
    { path:'/sire', element:<AppLayout><SIRE/></AppLayout> },
    { path:'/conciliacion-bancaria', element:<AppLayout><ConciliacionBancaria/></AppLayout> },
    { path:'/motor-asientos', element:<AppLayout><MotorAsientos/></AppLayout> },
    { path:'/mi-perfil', element:<AppLayout><MiPerfil/></AppLayout> },
    { path:'/setup-datos', element:<Navigate to="/mantenimiento-datos" replace /> },
    { path:'/mantenimiento-datos', element:<AppLayout><MantenimientoDatos/></AppLayout> },
    { path:'/validacion-datos', element:<AppLayout><ValidacionDatos/></AppLayout> },
    { path:'/configuracion', element:<AppLayout><Configuracion/></AppLayout> },
  ]}
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
