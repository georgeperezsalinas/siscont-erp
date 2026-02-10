import { create } from 'zustand'
import type { MeResponse } from '@/api'

type AuthState = {
  token: string | null
  user: MeResponse | null
  setToken: (t: string | null) => void
  setUser: (u: MeResponse | null) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('siscont_token'),
  user: null,
  setToken: (t) => {
    if (t) localStorage.setItem('siscont_token', t)
    else localStorage.removeItem('siscont_token')
    set({ token: t })
  },
  setUser: (u) => set({ user: u }),
  logout: () => {
    localStorage.removeItem('siscont_token')
    set({ token: null, user: null })
    // Redirigir al login si no estamos ya ahí
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }
}))
