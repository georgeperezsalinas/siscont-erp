import { create } from 'zustand'

type Theme = 'light' | 'dark'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

// Función para aplicar tema al documento
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  localStorage.setItem('siscont-theme', theme)
}

// Cargar tema guardado al inicio
let savedTheme: Theme = 'light'
if (typeof window !== 'undefined') {
  savedTheme = (localStorage.getItem('siscont-theme') as Theme) || 'light'
  applyTheme(savedTheme)
}

export const useTheme = create<ThemeState>((set, get) => {
  // Sincronizar estado inicial con el DOM
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('siscont-theme') as Theme
    if (stored && stored !== savedTheme) {
      savedTheme = stored
      applyTheme(stored)
    }
  }
  
  return {
    theme: savedTheme,
    setTheme: (theme) => {
      applyTheme(theme)
      set({ theme })
    },
    toggleTheme: () => {
      const currentTheme = get().theme
      const newTheme = currentTheme === 'light' ? 'dark' : 'light'
      applyTheme(newTheme)
      set({ theme: newTheme })
    },
  }
})

