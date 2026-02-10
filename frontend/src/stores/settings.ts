import { create } from 'zustand'
import { getSystemSettings, type SystemSettings } from '@/api'

type SettingsState = {
  settings: SystemSettings | null
  loading: boolean
  loadSettings: (companyId: number) => Promise<void>
  getNumberFormat: () => { thousand: string; decimal: string; decimals: number }
  getCurrencyFormat: () => { code: string; symbol: string }
}

// Configuración por defecto (formato peruano)
const defaultSettings: SystemSettings = {
  id: 0,
  company_id: 0,
  number_thousand_separator: ',',
  number_decimal_separator: '.',
  number_decimal_places: 2,
  currency_code: 'PEN',
  currency_symbol: 'S/',
  date_format: 'DD/MM/YYYY',
  default_igv_rate: 18.00,
  fiscal_year_start_month: 1,
  allow_edit_closed_periods: false,
  auto_generate_journal_entries: true,
  require_period_validation: true,
  extra_settings: null
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  
  loadSettings: async (companyId: number) => {
    set({ loading: true })
    try {
      const settings = await getSystemSettings(companyId)
      set({ settings, loading: false })
    } catch (err) {
      console.error('Error cargando configuración:', err)
      // Usar configuración por defecto si falla
      set({ settings: { ...defaultSettings, company_id: companyId }, loading: false })
    }
  },

  getNumberFormat: () => {
    const { settings } = get()
    const s = settings || defaultSettings
    return {
      thousand: s.number_thousand_separator,
      decimal: s.number_decimal_separator,
      decimals: s.number_decimal_places
    }
  },

  getCurrencyFormat: () => {
    const { settings } = get()
    const s = settings || defaultSettings
    return {
      code: s.currency_code,
      symbol: s.currency_symbol
    }
  }
}))

