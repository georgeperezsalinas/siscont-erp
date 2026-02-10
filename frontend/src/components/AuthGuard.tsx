import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/stores/auth'
export default function AuthGuard(){ const token = useAuth(s=>s.token); return token ? <Outlet/> : <Navigate to="/login" replace/> }
