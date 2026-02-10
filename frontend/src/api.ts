// En desarrollo, usar URL absoluta si el proxy no funciona
// En producción, usar '/api' para que funcione con el servidor web
export const API_BASE = import.meta.env.VITE_API_BASE || 
  (import.meta.env.DEV ? 'http://localhost:8000' : '/api');
export function getToken(): string | null { return localStorage.getItem('siscont_token'); }
export function setToken(t: string) { localStorage.setItem('siscont_token', t); }
export function removeToken() { localStorage.removeItem('siscont_token'); }

// Función para manejar errores de autenticación
function handleAuthError() {
  removeToken()
  // Redirigir al login si no estamos ya ahí
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    
    // Si es 401 (Unauthorized), la sesión expiró
    if (res.status === 401) {
      handleAuthError()
      const text = await res.text()
      throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.')
    }
    
    // Si es 403 (Forbidden), también puede ser un problema de autenticación
    if (res.status === 403 && path.includes('/auth/me')) {
      // Si falla /auth/me con 403, probablemente el token es inválido
      handleAuthError()
      const text = await res.text()
      throw new Error('Sesión inválida. Por favor, inicia sesión nuevamente.')
    }
    
    if (!res.ok) { 
      const text = await res.text(); 
      throw new Error(`${res.status} ${res.statusText}: ${text}`); 
    }
    
    // Si es 204 No Content, retornar undefined
    if (res.status === 204) return undefined;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  } catch (err: any) {
    // Si es un error de red y estamos intentando autenticarnos, redirigir al login
    if ((err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || err.name === 'TypeError') && token) {
      // Solo redirigir si es un endpoint crítico de autenticación
      if (path.includes('/auth/me') || path.includes('/auth/')) {
        console.error('[apiFetch] Error de red en endpoint de autenticación:', err)
        handleAuthError()
        throw new Error('Error de conexión. Por favor, verifica tu conexión e intenta iniciar sesión nuevamente.')
      }
    }
    throw err
  }
}
export async function login(username: string, password: string) {
  const form = new URLSearchParams();
  form.set('username', username);
  form.set('password', password);
  
  console.log('[Login] Iniciando login para usuario:', username);
  console.log('[Login] URL:', `${API_BASE}/auth/login`);
  
  try {
    const res = await fetch(`${API_BASE}/auth/login`, { 
      method: 'POST', 
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString()
    });
    
    console.log('[Login] Respuesta recibida:', res.status, res.statusText);
    
    if (!res.ok) {
      const text = await res.text();
      console.error('[Login] Error:', res.status, text);
      throw new Error(`Error ${res.status}: ${text || 'Error de conexión con el servidor'}`);
    }
    
    const data = await res.json();
    console.log('[Login] Datos recibidos:', { hasAccessToken: !!data.access_token });
    // El token será guardado por el componente que llama a login()
    return data;
  } catch (err: any) {
    console.error('[Login] Excepción:', err);
    // Si es un error de red (backend no disponible)
    if (err.message.includes('Failed to fetch') || err.message.includes('fetch')) {
      throw new Error('No se pudo conectar con el servidor. Verifica que el backend esté corriendo en http://localhost:8000');
    }
    throw err;
  }
}

// ===== AUTH ME =====
export type CompanySimple = { id: number; name: string; ruc?: string; active: boolean }
export type MeResponse = { id: number; username: string; is_admin: boolean; role: string; user_type?: string; nombre?: string; apellido?: string; correo?: string; foto?: string; companies: CompanySimple[] }
export async function getMe(): Promise<MeResponse> {
  return apiFetch('/auth/me')
}

// ===== COMPANIES API =====
export type Company = { 
  id: number
  name: string
  ruc?: string | null
  commercial_name?: string | null
  taxpayer_type?: string | null
  fiscal_address?: string | null
  ubigeo?: string | null
  phone?: string | null
  email?: string | null
  tax_regime?: string | null
  economic_activity_code?: string | null
  sunat_status?: string | null
  domicile_condition?: string | null
  legal_representative_name?: string | null
  legal_representative_dni?: string | null
  legal_representative_position?: string | null
  active: boolean
}
export type CompanyIn = { 
  name: string
  ruc?: string | null
  commercial_name?: string | null
  taxpayer_type?: string | null
  fiscal_address?: string | null
  ubigeo?: string | null
  phone?: string | null
  email?: string | null
  tax_regime?: string | null
  economic_activity_code?: string | null
  sunat_status?: string | null
  domicile_condition?: string | null
  legal_representative_name?: string | null
  legal_representative_dni?: string | null
  legal_representative_position?: string | null
}
export type CompanyUpdate = { 
  name?: string | null
  ruc?: string | null
  commercial_name?: string | null
  taxpayer_type?: string | null
  fiscal_address?: string | null
  ubigeo?: string | null
  phone?: string | null
  email?: string | null
  tax_regime?: string | null
  economic_activity_code?: string | null
  sunat_status?: string | null
  domicile_condition?: string | null
  legal_representative_name?: string | null
  legal_representative_dni?: string | null
  legal_representative_position?: string | null
}

export type CompanyPage = { items: Company[]; total: number }
export async function listCompanies(params?: { q?: string; active?: boolean; order_by?: string; page?: number; page_size?: number }): Promise<CompanyPage> {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.active !== undefined) q.set('active', String(params.active))
  if (params?.order_by) q.set('order_by', params.order_by)
  if (params?.page) q.set('page', String(params.page))
  if (params?.page_size) q.set('page_size', String(params.page_size))
  const qs = q.toString()
  return apiFetch(`/companies${qs ? `?${qs}` : ''}`)
}

export async function createCompany(data: CompanyIn): Promise<Company> {
  return apiFetch('/companies', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateCompany(id: number, data: CompanyUpdate): Promise<Company> {
  return apiFetch(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deactivateCompany(id: number): Promise<Company> {
  return apiFetch(`/companies/${id}/deactivate`, { method: 'PATCH' })
}

export async function activateCompany(id: number): Promise<Company> {
  return apiFetch(`/companies/${id}/activate`, { method: 'PATCH' })
}

export async function deleteCompany(id: number): Promise<void> {
  await apiFetch(`/companies/${id}`, { method: 'DELETE' })
}

export async function exportCompaniesCsv(params?: { q?: string; active?: boolean }): Promise<Blob> {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.active !== undefined) q.set('active', String(params.active))
  q.set('format', 'csv')
  const res = await fetch(`${API_BASE}/companies/export${q.toString() ? `?${q.toString()}` : ''}`, {
    headers: { Authorization: getToken() ? `Bearer ${getToken()}` : '' }
  })
  if (!res.ok) throw new Error(`Error exportando CSV: ${res.status}`)
  return await res.blob()
}

export async function exportCompaniesExcel(params?: { q?: string; active?: boolean }): Promise<Blob> {
  const q = new URLSearchParams()
  if (params?.q) q.set('q', params.q)
  if (params?.active !== undefined) q.set('active', String(params.active))
  q.set('format', 'excel')
  const res = await fetch(`${API_BASE}/companies/export${q.toString() ? `?${q.toString()}` : ''}`, {
    headers: { Authorization: getToken() ? `Bearer ${getToken()}` : '' }
  })
  if (!res.ok) {
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.detail || `Error ${res.status}: ${text}`)
    } catch {
      throw new Error(`Error exportando Excel: ${res.status} ${res.statusText} - ${text}`)
    }
  }
  return await res.blob()
}

// ===== INVENTARIOS API =====

// Productos
export interface Product {
  id: number
  company_id: number
  code: string
  name: string
  description: string | null
  unit_of_measure: string
  account_code: string
  active: boolean
  stock_actual?: number
  costo_promedio?: number
}

export interface ProductIn {
  company_id: number
  code: string
  name: string
  description?: string | null
  unit_of_measure: string
  account_code: string
}

export interface ProductUpdate {
  code?: string
  name?: string
  description?: string | null
  unit_of_measure?: string
  account_code?: string
  active?: boolean
}

export async function listProducts(company_id: number, active?: boolean): Promise<Product[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (active !== undefined) params.append('active', String(active))
  return apiFetch(`/inventarios/productos?${params}`)
}

export async function getProduct(product_id: number): Promise<Product> {
  return apiFetch(`/inventarios/productos/${product_id}`)
}

export async function createProduct(data: ProductIn): Promise<Product> {
  return apiFetch('/inventarios/productos', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function updateProduct(product_id: number, data: ProductUpdate): Promise<Product> {
  return apiFetch(`/inventarios/productos/${product_id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

export async function deleteProduct(product_id: number): Promise<void> {
  return apiFetch(`/inventarios/productos/${product_id}`, { method: 'DELETE' })
}

// Movimientos de Inventario
export interface MovimientoInventarioIn {
  company_id: number
  product_id: number
  movement_type: 'ENTRADA' | 'SALIDA'
  quantity: number
  unit_cost?: number | null  // Obligatorio para ENTRADA, opcional para SALIDA (se calcula costo promedio)
  movement_date: string  // YYYY-MM-DD
  reference?: string | null
  reference_type?: string | null  // "COMPRA", "VENTA", "AJUSTE", "MERMA", etc.
  reference_id?: number | null
  glosa?: string | null
  credit_account_code?: string | null  // Solo para ENTRADAS
}

export interface MovimientoInventarioOut {
  movimiento_id: number
  product_id: number
  product_code?: string | null
  product_name?: string | null
  movement_type: string
  quantity: number
  unit_cost: number
  total_cost: number
  movement_date: string
  reference?: string | null
  reference_type?: string | null
  reference_id?: number | null
  glosa?: string | null
  journal_entry_id?: number | null
  has_journal_entry: boolean
  journal_entry_status?: string | null
}

export async function createMovimientoInventario(data: MovimientoInventarioIn): Promise<MovimientoInventarioOut> {
  return apiFetch('/inventarios/movimientos', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function listMovimientosInventario(
  company_id: number,
  product_id?: number,
  movement_type?: string,
  date_from?: string,
  date_to?: string
): Promise<MovimientoInventarioOut[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (product_id) params.append('product_id', String(product_id))
  if (movement_type) params.append('movement_type', movement_type)
  if (date_from) params.append('date_from', date_from)
  if (date_to) params.append('date_to', date_to)
  return apiFetch(`/inventarios/movimientos?${params}`)
}

export async function getStock(product_id: number): Promise<{
  product_id: number
  product_code: string
  product_name: string
  unit_of_measure: string
  stock_actual: number
  costo_promedio: number
  valor_total: number
}> {
  return apiFetch(`/inventarios/stock/${product_id}`)
}

// ===== ALMACENES API =====

export interface Almacen {
  id: number
  company_id: number
  codigo: string
  nombre: string
  activo: boolean
}

export interface AlmacenIn {
  company_id: number
  codigo: string
  nombre: string
  activo?: boolean
}

export async function listAlmacenes(company_id: number, activo?: boolean): Promise<Almacen[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (activo !== undefined) params.append('activo', String(activo))
  return apiFetch(`/inventarios/almacenes?${params}`)
}

export async function createAlmacen(data: AlmacenIn): Promise<Almacen> {
  return apiFetch('/inventarios/almacenes', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

// ===== NUEVOS ENDPOINTS DE INVENTARIO =====

export interface EntradaInventarioIn {
  company_id: number
  producto_id: number
  almacen_id?: number | null
  cantidad: number
  costo_unitario: number
  fecha: string  // YYYY-MM-DD
  referencia_tipo?: string | null
  referencia_id?: number | null
  glosa?: string | null
  usar_motor?: boolean
}

export interface SalidaInventarioIn {
  company_id: number
  producto_id: number
  almacen_id?: number | null
  cantidad: number
  fecha: string  // YYYY-MM-DD
  referencia_tipo?: string | null
  referencia_id?: number | null
  glosa?: string | null
  usar_motor?: boolean
}

export interface AjusteInventarioIn {
  company_id: number
  producto_id: number
  almacen_id?: number | null
  cantidad: number  // Positivo para sobrante, negativo para faltante
  motivo: string
  fecha: string  // YYYY-MM-DD
  usar_motor?: boolean
}

export interface MovimientoInventarioV2Out {
  movimiento_id: number
  tipo: string
  producto_id: number
  producto_code?: string | null
  producto_name?: string | null
  almacen_id?: number | null
  almacen_codigo?: string | null
  almacen_nombre?: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
  fecha: string
  referencia_tipo?: string | null
  referencia_id?: number | null
  glosa?: string | null
  journal_entry_id?: number | null
  created_at?: string | null
}

export interface KardexRow {
  id: number
  fecha: string
  tipo: string
  producto_id?: number
  producto_code?: string | null
  producto_name?: string | null
  almacen_codigo?: string | null
  almacen_nombre?: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
  saldo_cantidad: number
  saldo_costo_promedio: number
  saldo_valor_total: number
  referencia?: string | null
  glosa?: string | null
  journal_entry_id?: number | null
}

export interface StockRow {
  producto_id: number
  producto_code: string
  producto_name: string
  almacen_id?: number | null
  almacen_codigo?: string | null
  almacen_nombre?: string | null
  cantidad_actual: number
  costo_promedio: number
  valor_total: number
}

export async function registrarEntradaInventario(data: EntradaInventarioIn): Promise<MovimientoInventarioV2Out> {
  return apiFetch('/inventarios/entrada', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function registrarSalidaInventario(data: SalidaInventarioIn): Promise<MovimientoInventarioV2Out> {
  return apiFetch('/inventarios/salida', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function ajustarStockInventario(data: AjusteInventarioIn): Promise<MovimientoInventarioV2Out> {
  return apiFetch('/inventarios/ajuste', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function obtenerKardex(
  company_id: number,
  producto_id?: number,
  almacen_id?: number,
  fecha_desde?: string,
  fecha_hasta?: string
): Promise<KardexRow[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (producto_id) params.append('producto_id', String(producto_id))
  if (almacen_id) params.append('almacen_id', String(almacen_id))
  if (fecha_desde) params.append('fecha_desde', fecha_desde)
  if (fecha_hasta) params.append('fecha_hasta', fecha_hasta)
  return apiFetch(`/inventarios/kardex?${params}`)
}

export async function eliminarMovimientoInventario(
  movimiento_id: number,
  company_id: number
): Promise<{ message: string }> {
  return apiFetch(`/inventarios/movimientos/${movimiento_id}?company_id=${company_id}`, {
    method: 'DELETE'
  })
}

export async function obtenerStock(
  company_id: number,
  producto_id?: number,
  almacen_id?: number
): Promise<StockRow[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (producto_id) params.append('producto_id', String(producto_id))
  if (almacen_id) params.append('almacen_id', String(almacen_id))
  return apiFetch(`/inventarios/stock?${params}`)
}

// ===== USERS API =====
export type User = { id: number; username: string; role: string; is_admin: boolean; nombre?: string; apellido?: string; correo?: string; foto?: string; companies: CompanySimple[] }
export type UserIn = { username: string; password: string; role?: string; role_id?: number; company_ids: number[]; nombre?: string; apellido?: string; correo?: string; foto?: string }
export type UserUpdate = { username?: string; password?: string; role?: string; role_id?: number; company_ids?: number[]; nombre?: string; apellido?: string; correo?: string; foto?: string }

export async function listUsers(): Promise<User[]> {
  return apiFetch('/users')
}

export async function createUser(data: UserIn): Promise<User> {
  return apiFetch('/users', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateUser(id: number, data: UserUpdate): Promise<User> {
  return apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteUser(id: number): Promise<void> {
  await apiFetch(`/users/${id}`, { method: 'DELETE' })
}

export async function activateUser(id: number): Promise<User> {
  return apiFetch(`/users/${id}/activate`, { method: 'PATCH' })
}

export async function getMeUser(): Promise<User> {
  return apiFetch('/users/me')
}

export async function uploadUserPhoto(userId: number, file: File): Promise<User> {
  const formData = new FormData()
  formData.append('file', file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/users/${userId}/photo`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status}: ${text || 'Error subiendo foto'}`)
  }
  return res.json()
}

export async function deleteUserPhoto(userId: number): Promise<User> {
  return apiFetch(`/users/${userId}/photo`, { method: 'DELETE' })
}

export function getUserPhotoUrl(userId: number): string {
  return `${API_BASE}/users/${userId}/photo`
}

// ===== PERIODS API =====
export type Period = { 
  id: number
  company_id: number
  year: number
  month: number
  status: string  // ABIERTO, CERRADO, REABIERTO
  closed_at?: string | null
  closed_by?: number | null
  reopened_at?: string | null
  reopened_by?: number | null
  close_reason?: string | null
  reopen_reason?: string | null
}
export type PeriodIn = { empresa_id: number; year: number; month: number; status?: string }
export type PeriodUpdate = { year?: number; month?: number; status?: string }

export type PeriodCloseValidation = {
  period_id: number
  period: string
  valid: boolean
  errors: string[]
  warnings: string[]
  entry_count: number
  unbalanced_entries: Array<{ entry_id: number; date: string; glosa: string; debit: number; credit: number; difference: number }>
  pending_entries: Array<{ entry_id: number; date: string; status: string; glosa: string }>
  invalid_accounts: number[]
  entries_out_of_period: Array<{ entry_id: number; date: string; glosa: string }>
}

export type ClosePeriodRequest = { reason?: string }
export type ReopenPeriodRequest = { reason?: string }

export async function listPeriods(company_id: number): Promise<Period[]> {
  return apiFetch(`/periods?company_id=${company_id}`)
}

export async function createPeriod(data: PeriodIn): Promise<Period> {
  return apiFetch('/periods', { method: 'POST', body: JSON.stringify(data) })
}

export async function updatePeriod(id: number, data: PeriodUpdate): Promise<Period> {
  return apiFetch(`/periods/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deletePeriod(id: number): Promise<void> {
  await apiFetch(`/periods/${id}`, { method: 'DELETE' })
}

export async function validatePeriodClose(period_id: number): Promise<PeriodCloseValidation> {
  return apiFetch(`/periods/${period_id}/close-validation`)
}

export async function closePeriod(period_id: number, reason?: string): Promise<Period> {
  return apiFetch(`/periods/${period_id}/close`, { 
    method: 'POST', 
    body: JSON.stringify({ reason: reason || null }) 
  })
}

export async function reopenPeriod(period_id: number, reason?: string): Promise<Period> {
  return apiFetch(`/periods/${period_id}/reopen`, { 
    method: 'POST', 
    body: JSON.stringify({ reason: reason || null }) 
  })
}

// ===== SETUP API =====
export async function seedPcge(empresa_id: number, replace_all: boolean = false): Promise<{created: number; deleted?: number; failed_deletions?: string[]}> {
  return apiFetch(`/setup/seed-pcge?company_id=${empresa_id}&replace_all=${replace_all}`, { method: 'POST' })
}

export async function ensureBasicAccounts(company_id: number, replace_all: boolean = false): Promise<{ message: string; company_id: number; accounts_created: number; total_accounts: number; deleted?: number }> {
  return apiFetch(`/setup/ensure-basic-accounts?company_id=${company_id}&replace_all=${replace_all}`, { method: 'POST' })
}

// ===== ACCOUNTS API =====
export type Account = { 
  id: number
  company_id: number
  code: string
  name: string
  level: number
  type: string  // Naturaleza contable: A, P, PN, I, G, C
  class_code?: string | null  // Clase PCGE: "10", "40", "70", etc.
  class_name?: string | null  // Nombre de clase: "Caja y Bancos", "Tributos", etc.
  active: boolean
  is_base?: boolean  // Indica si es una cuenta base del plan_base.csv (no se puede eliminar)
}
export type AccountIn = { 
  company_id: number
  code: string
  name: string
  level: number
  type: string
  class_code?: string | null
  class_name?: string | null
}
export type AccountUpdate = { 
  code?: string
  name?: string
  level?: number
  type?: string
  class_code?: string | null
  class_name?: string | null
  active?: boolean
}

export async function listAccounts(company_id: number): Promise<Account[]> {
  return apiFetch(`/accounts?company_id=${company_id}`)
}

export async function createAccount(data: AccountIn): Promise<Account> {
  return apiFetch('/accounts', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateAccount(id: number, data: AccountUpdate): Promise<Account> {
  return apiFetch(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteAccount(id: number): Promise<void> {
  await apiFetch(`/accounts/${id}`, { method: 'DELETE' })
}

// ===== JOURNAL ENTRIES API =====
export type EntryLineIn = { account_code: string; debit: number; credit: number; memo?: string; third_party_id?: number; cost_center?: string }
export type JournalEntryIn = { company_id: number; date: string; glosa: string; currency?: string; exchange_rate?: number; origin?: string; lines: EntryLineIn[] }
export type EntryLineOut = { id: number; account_code: string; account_name: string; debit: number; credit: number; memo?: string; third_party_id?: number; cost_center?: string }
export type JournalEntry = { id: number; company_id: number; date: string; glosa: string; currency: string; origin: string; status: string; total_debit: number; total_credit: number; period_id?: number; correlative?: string; reversed_entry_id?: number; motor_metadata?: { evento_tipo?: string; reglas_aplicadas?: any[]; reglas_descartadas?: any[]; hash_contexto?: string; engine_log?: { engine_run_id?: string; engine_started_at?: string; evento_tipo?: string; company_id?: number; origin?: string; fecha?: string; glosa?: string; datos_operacion_keys?: string[]; warnings?: Array<{ ts?: string; action?: string; details?: any }>; errors?: Array<{ ts?: string; action?: string; details?: any }>; steps?: Array<{ ts?: string; level?: string; action?: string; details?: any }> } } }
export type JournalEntryDetail = JournalEntry & { period_id: number; period_year: number; period_month: number; exchange_rate: number; lines: EntryLineOut[] }

export async function listJournalEntries(params: { company_id: number; period_id?: number; date_from?: string; date_to?: string; account_code?: string; status?: string; include_lines?: boolean }): Promise<JournalEntry[] | JournalEntryDetail[]> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period_id) q.set('period_id', String(params.period_id))
  if (params.date_from) q.set('date_from', params.date_from)
  if (params.date_to) q.set('date_to', params.date_to)
  if (params.account_code) q.set('account_code', params.account_code)
  if (params.status) q.set('status', params.status)
  if (params.include_lines) q.set('include_lines', 'true')
  return apiFetch(`/journal/entries?${q.toString()}`)
}

export async function getJournalEntry(id: number): Promise<JournalEntryDetail> {
  return apiFetch(`/journal/entries/${id}`)
}

export async function createJournalEntry(data: JournalEntryIn): Promise<JournalEntry> {
  return apiFetch('/journal/entries', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateJournalEntry(id: number, data: JournalEntryIn): Promise<JournalEntry> {
  return apiFetch(`/journal/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function voidJournalEntry(id: number): Promise<JournalEntry> {
  return apiFetch(`/journal/entries/${id}/void`, { method: 'PATCH' })
}

export async function reactivateJournalEntry(id: number): Promise<JournalEntry> {
  return apiFetch(`/journal/entries/${id}/reactivate`, { method: 'PATCH' })
}

// ===== JOURNAL MANUAL API =====
export async function getDraftEntryWarnings(id: number): Promise<{
  warnings: Array<{ code: string; message: string; requires_confirmation: boolean }>
  errors: Array<{ code: string; message: string }>
  has_errors: boolean
  has_warnings: boolean
}> {
  return apiFetch(`/journal/manual/${id}/warnings`)
}

export async function postDraftEntry(id: number, confirmedWarnings?: string[]): Promise<JournalEntry> {
  return apiFetch(`/journal/manual/${id}/post`, {
    method: 'POST',
    body: JSON.stringify({ confirmed_warnings: confirmedWarnings || [] })
  })
}

export async function reverseEntry(id: number, reversalDate?: string, reversalGlosa?: string, reversalReason?: string): Promise<JournalEntry> {
  return apiFetch(`/journal/manual/${id}/reverse`, {
    method: 'POST',
    body: JSON.stringify({
      reversal_date: reversalDate,
      reversal_glosa: reversalGlosa,
      reversal_reason: reversalReason
    })
  })
}

export async function createAdjustmentEntry(id: number, adjustmentDate?: string, adjustmentGlosa?: string, adjustmentReason?: string): Promise<JournalEntryDetail> {
  return apiFetch(`/journal/manual/${id}/adjust`, {
    method: 'POST',
    body: JSON.stringify({
      adjustment_date: adjustmentDate,
      adjustment_glosa: adjustmentGlosa,
      adjustment_reason: adjustmentReason
    })
  })
}

// ===== JOURNAL VALIDATION API =====
export type AccountValidationResult = {
  is_valid: boolean
  errors: Array<{ rule: string; message: string; accounts: string[] }>
  warnings: Array<{ rule: string; message: string; accounts: string[] }>
  suggestions: Array<{ rule: string; message: string; suggested_accounts: string[]; suggested_glosa?: string }>
  compatible_accounts: Array<{ account_code: string; compatible_accounts: string[]; confidence: number }>
}

export async function validateJournalEntry(data: JournalEntryIn): Promise<AccountValidationResult> {
  return apiFetch('/journal/entries/validate', { method: 'POST', body: JSON.stringify(data) })
}

// ===== BASE ACCOUNTING CHECKS API =====
export type BaseAccountingCheck = {
  code: string
  entry_type: string
  message: string
  severity: 'INFO' | 'WARNING' | 'ERROR'
  description: string
  suggested_glosa: string
  suggested_accounts: Array<{
    code: string
    name: string
    side: 'debit' | 'credit'
    suggested_amount?: number | null
  }>
  action: {
    label: string
    url: string
    entry_type: string
  }
  period_id?: number
  company_id?: number
}

export async function getBaseAccountingChecks(
  companyId: number,
  periodId?: number
): Promise<BaseAccountingCheck[]> {
  const q = new URLSearchParams()
  q.set('company_id', companyId.toString())
  if (periodId) q.set('period_id', periodId.toString())
  return apiFetch(`/accounting/base-checks?${q.toString()}`)
}

// ===== ACCOUNT RULES API =====
export type AccountValidationRule = {
  id: number
  company_id: number
  rule_type: 'INCOMPATIBLE' | 'REQUIRED_PAIR' | 'SUGGESTION' | 'WARNING'
  name: string
  description?: string
  account_patterns: string[]
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  suggested_accounts?: string[]
  suggested_glosa?: string
  conditions?: any
  active: boolean
}

export type AccountValidationRuleIn = Omit<AccountValidationRule, 'id'>

export async function listAccountValidationRules(company_id: number): Promise<AccountValidationRule[]> {
  return apiFetch(`/account-rules/validation-rules?company_id=${company_id}`)
}

export async function createAccountValidationRule(data: AccountValidationRuleIn): Promise<AccountValidationRule> {
  return apiFetch('/account-rules/validation-rules', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateAccountValidationRule(id: number, data: AccountValidationRuleIn): Promise<AccountValidationRule> {
  return apiFetch(`/account-rules/validation-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteAccountValidationRule(id: number): Promise<void> {
  return apiFetch(`/account-rules/validation-rules/${id}`, { method: 'DELETE' })
}

export async function loadDefaultAccountRules(company_id: number): Promise<{ success: boolean; created_count: number }> {
  return apiFetch(`/account-rules/validation-rules/load-defaults?company_id=${company_id}`, { method: 'POST' })
}

// ===== JOURNAL ENGINE API =====
export type EventoContable = {
  id: number
  company_id: number
  tipo: string
  nombre: string
  descripcion?: string
  categoria?: string  // GENERAL, TESORERIA, INVENTARIO, COMPRAS, VENTAS
  activo: boolean
}

export type ReglaContable = {
  id: number
  evento_id: number
  company_id: number
  condicion?: string
  lado: 'DEBE' | 'HABER'
  tipo_cuenta: string
  tipo_monto: string
  orden: number
  config?: any
  activo: boolean
}

export type ReglaContableIn = {
  evento_id: number
  condicion?: string
  lado: 'DEBE' | 'HABER'
  tipo_cuenta: string
  tipo_monto: string
  orden: number
  config?: any
  activo: boolean
}

export type TipoCuentaMapeo = {
  id: number
  company_id: number
  tipo_cuenta: string
  account_id: number
  account_code: string
  account_name: string
  config?: any
  activo: boolean
}

export type TipoCuentaMapeoIn = {
  tipo_cuenta: string
  account_id: number
  config?: any
  activo: boolean
}

export async function listEventosContables(company_id: number, auto_init: boolean = false): Promise<EventoContable[]> {
  return apiFetch(`/journal-engine/eventos?company_id=${company_id}&auto_init=${auto_init}`)
}

export async function createEventoContable(company_id: number, tipo: string, nombre: string, descripcion?: string, categoria?: string): Promise<EventoContable> {
  return apiFetch(`/journal-engine/eventos?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify({ tipo, nombre, descripcion, categoria })
  })
}

export async function updateEventoContable(company_id: number, evento_id: number, tipo: string, nombre: string, descripcion?: string, categoria?: string): Promise<EventoContable> {
  return apiFetch(`/journal-engine/eventos/${evento_id}?company_id=${company_id}`, {
    method: 'PUT',
    body: JSON.stringify({ tipo, nombre, descripcion, categoria })
  })
}

export async function toggleEventoActivo(company_id: number, evento_id: number): Promise<EventoContable> {
  return apiFetch(`/journal-engine/eventos/${evento_id}/toggle-activo?company_id=${company_id}`, {
    method: 'PATCH'
  })
}

export async function listReglasContables(company_id: number, evento_id?: number): Promise<ReglaContable[]> {
  const url = evento_id 
    ? `/journal-engine/reglas?company_id=${company_id}&evento_id=${evento_id}`
    : `/journal-engine/reglas?company_id=${company_id}`
  return apiFetch(url)
}

export async function createReglaContable(company_id: number, data: ReglaContableIn): Promise<ReglaContable> {
  return apiFetch(`/journal-engine/reglas?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function updateReglaContable(company_id: number, regla_id: number, data: ReglaContableIn): Promise<ReglaContable> {
  return apiFetch(`/journal-engine/reglas/${regla_id}?company_id=${company_id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function deleteReglaContable(company_id: number, regla_id: number): Promise<void> {
  return apiFetch(`/journal-engine/reglas/${regla_id}?company_id=${company_id}`, { method: 'DELETE' })
}

export async function listTipoCuentaMapeos(company_id: number): Promise<TipoCuentaMapeo[]> {
  return apiFetch(`/journal-engine/tipo-cuenta-mapeos?company_id=${company_id}`)
}

export async function createTipoCuentaMapeo(company_id: number, data: TipoCuentaMapeoIn): Promise<TipoCuentaMapeo> {
  return apiFetch(`/journal-engine/tipo-cuenta-mapeos?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function autoMapearTodos(company_id: number): Promise<{ success: boolean; message: string; mapeados: number; no_encontrados: string[]; ya_existian: number; creados: number; requieren_revision?: Array<{ tipo_cuenta: string; account_code: string; account_name: string; score: number }> }> {
  return apiFetch(`/journal-engine/tipo-cuenta-mapeos/auto-map?company_id=${company_id}`, { method: 'POST' })
}

export async function autoMapearTipo(company_id: number, tipo_cuenta: string): Promise<{ success: boolean; message: string; score?: number; cuenta_sugerida?: { account_id: number; account_code: string; account_name: string; score: number }; mapeo?: any; sugerencias?: any[] }> {
  return apiFetch(`/journal-engine/tipo-cuenta-mapeos/auto-map/${tipo_cuenta}?company_id=${company_id}`, { method: 'POST' })
}

export async function getSugerenciasMapeo(company_id: number, tipo_cuenta: string): Promise<{ tipo_cuenta: string; sugerencias: Array<{ account_id: number; account_code: string; account_name: string; account_type: string; score: number }> }> {
  return apiFetch(`/journal-engine/tipo-cuenta-mapeos/sugerencias/${tipo_cuenta}?company_id=${company_id}`)
}

export async function initJournalEngineDefaults(company_id: number): Promise<{ eventos_creados: number; reglas_creadas: number; mensaje: string }> {
  return apiFetch(`/journal-engine/init-defaults?company_id=${company_id}`, { method: 'POST' })
}

export async function generarAsientoPrueba(
  company_id: number,
  evento_tipo: string,
  datos_operacion: any,
  fecha: string,
  glosa: string
): Promise<{ success: boolean; simulacion?: boolean; asiento_id?: number; total_debit: number; total_credit: number; cuadra: boolean; lineas?: any[]; evento?: string; evento_nombre?: string }> {
  // Usar endpoint de simulación que no crea asientos reales
  return apiFetch(`/journal-engine/simular-asiento?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify({ evento_tipo, datos_operacion, fecha, glosa, currency: 'PEN', exchange_rate: 1.0 })
  })
}

// ===== JOURNAL SUGGESTIONS API =====
export type AccountSuggestion = { code: string; name: string; type: string }
export type SuggestedEntryLine = { account_code: string; account_name?: string; side: 'debit' | 'credit'; amount?: number }

export async function suggestAccounts(company_id: number, query: string): Promise<{ suggestions: AccountSuggestion[] }> {
  return apiFetch(`/journal/suggest-accounts?company_id=${company_id}&query=${encodeURIComponent(query)}`)
}

export async function suggestEntry(company_id: number, glosa: string, monto?: number): Promise<{ suggested_lines: SuggestedEntryLine[]; confidence: string }> {
  const params = new URLSearchParams()
  params.set('company_id', String(company_id))
  params.set('glosa', glosa)
  if (monto) params.set('monto', String(monto))
  return apiFetch(`/journal/suggest-entry?${params.toString()}`)
}

export async function getSimilarEntries(company_id: number, glosa: string): Promise<{ similar_entries: any[] }> {
  return apiFetch(`/journal/similar-entries?company_id=${company_id}&glosa=${encodeURIComponent(glosa)}`)
}

export type EntryTemplate = {
  id: string
  name: string
  description: string
  glosa_example: string
  lines: Array<{
    account_code: string
    account_name: string
    side: 'debit' | 'credit'
    description: string
    auto_calculate?: 'base' | 'igv' | 'total'
    optional?: boolean
  }>
}

export async function getEntryTemplates(company_id: number): Promise<{ templates: EntryTemplate[] }> {
  return apiFetch(`/journal/templates?company_id=${company_id}`)
}

// ===== COMPRAS API =====
export type PurchaseLineIn = {
  line_number?: number
  description: string
  quantity: number
  unit_price: number
}

export type CompraIn = {
  company_id: number
  doc_type?: string
  series: string
  number: string
  issue_date: string
  supplier_id: number
  currency?: string
  lines?: PurchaseLineIn[]  // Lista de líneas (nuevo)
  base_amount?: number  // Opcional: backward compatibility
  glosa?: string
}

export type PurchaseLineOut = {
  id: number
  line_number: number
  description: string
  quantity: number
  unit_price: number
  base_amount: number
  igv_amount: number
  total_amount: number
}

export type CompraOut = {
  compra_id: number
  journal_entry_id: number
  doc_type: string
  series: string
  number: string
  issue_date: string
  supplier_id: number
  total_amount: number
  has_journal_entry: boolean
  journal_entry_status: string | null
  lines?: PurchaseLineOut[]  // Líneas de detalle (opcional)
}

export async function listCompras(company_id: number, period?: string): Promise<CompraOut[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (period) params.append('period', period)
  return apiFetch(`/compras?${params}`)
}

export async function createCompra(data: CompraIn): Promise<CompraOut> {
  return apiFetch('/compras', { method: 'POST', body: JSON.stringify(data) })
}

export async function getCompra(compra_id: number): Promise<CompraOut> {
  return apiFetch(`/compras/${compra_id}`)
}

export type CompraUpdate = {
  doc_type?: string
  series?: string
  number?: string
  issue_date?: string
  supplier_id?: number
  currency?: string
  base_amount?: number
  lines?: PurchaseLineIn[]  // Líneas de detalle para actualizar
  glosa?: string
}

export async function updateCompra(compra_id: number, data: CompraUpdate): Promise<CompraOut> {
  return apiFetch(`/compras/${compra_id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteCompra(compra_id: number): Promise<{ message: string }> {
  return apiFetch(`/compras/${compra_id}`, { method: 'DELETE' })
}

// ===== VENTAS API =====
export type VentaIn = {
  company_id: number
  doc_type?: string
  series: string
  number: string
  issue_date: string
  customer_id: number
  currency?: string
  lines?: SaleLineIn[]  // Lista de líneas (nuevo)
  base_amount?: number  // Opcional: backward compatibility
  glosa?: string
  detraction_rate?: number | null  // Tasa de detracción (ej: 0.12 para 12%, 0.06 para 6%)
}

export type SaleLineOut = {
  id: number
  line_number: number
  description: string
  quantity: number
  unit_price: number
  base_amount: number
  igv_amount: number
  total_amount: number
}

export type VentaOut = {
  venta_id: number
  journal_entry_id: number
  doc_type: string
  series: string
  number: string
  issue_date: string
  customer_id: number
  total_amount: number
  detraction_rate?: number | null  // Tasa de detracción aplicada
  detraction_amount?: number | null  // Monto de detracción
  net_amount?: number | null  // Monto neto a recibir (total - detracción)
  has_journal_entry: boolean
  journal_entry_status: string | null
  lines?: SaleLineOut[]  // Líneas de detalle (opcional)
}

export async function listVentas(company_id: number, period?: string): Promise<VentaOut[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (period) params.append('period', period)
  return apiFetch(`/ventas?${params}`)
}

export async function createVenta(data: VentaIn): Promise<VentaOut> {
  return apiFetch('/ventas', { method: 'POST', body: JSON.stringify(data) })
}

export async function getVenta(venta_id: number): Promise<VentaOut> {
  return apiFetch(`/ventas/${venta_id}`)
}

export type VentaUpdate = {
  doc_type?: string
  series?: string
  number?: string
  issue_date?: string
  customer_id?: number
  currency?: string
  base_amount?: number
  lines?: SaleLineIn[]  // Líneas de detalle para actualizar
  glosa?: string
  detraction_rate?: number | null  // Tasa de detracción (ej: 0.12 para 12%, 0.06 para 6%)
}

export async function updateVenta(venta_id: number, data: VentaUpdate): Promise<VentaOut> {
  return apiFetch(`/ventas/${venta_id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteVenta(venta_id: number): Promise<{ message: string }> {
  return apiFetch(`/ventas/${venta_id}`, { method: 'DELETE' })
}

// ===== COBROS API =====
export type CobroIn = {
  payment_date: string
  amount: number
  cash_account_code?: string
  payment_method?: string
  payment_reference?: string | null
  notes?: string | null
}

export type CobroOut = {
  payment_id: number
  journal_entry_id: number
  payment_date: string
  amount: number
  saldo_pendiente: number
}

export async function registrarCobro(venta_id: number, data: CobroIn): Promise<CobroOut> {
  return apiFetch(`/ventas/${venta_id}/cobros`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function getSaldoPendienteVenta(venta_id: number): Promise<{ saldo_pendiente: number }> {
  return apiFetch(`/ventas/${venta_id}/saldo-pendiente`)
}

export type CobroListItem = {
  id: number
  payment_date: string
  amount: number
  payment_method: string
  payment_reference: string | null
  notes: string | null
  journal_entry_id: number | null
  created_at: string
  created_by: string | null
}

export async function listCobrosVenta(venta_id: number): Promise<CobroListItem[]> {
  return apiFetch(`/ventas/${venta_id}/cobros`)
}

export async function deleteCobro(cobro_id: number): Promise<{ message: string; saldo_pendiente: number }> {
  return apiFetch(`/ventas/cobros/${cobro_id}`, { method: 'DELETE' })
}

// ===== PAGOS API =====
export type PagoIn = {
  payment_date: string
  amount: number
  cash_account_code?: string
  payment_method?: string
  payment_reference?: string | null
  notes?: string | null
}

export type PagoOut = {
  payment_id: number
  journal_entry_id: number
  payment_date: string
  amount: number
  saldo_pendiente: number
}

export async function registrarPago(compra_id: number, data: PagoIn): Promise<PagoOut> {
  return apiFetch(`/compras/${compra_id}/pagos`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function getSaldoPendienteCompra(compra_id: number): Promise<{ saldo_pendiente: number }> {
  return apiFetch(`/compras/${compra_id}/saldo-pendiente`)
}

export type PagoListItem = {
  id: number
  payment_date: string
  amount: number
  payment_method: string
  payment_reference: string | null
  notes: string | null
  journal_entry_id: number | null
  created_at: string
  created_by: string | null
}

export async function listPagosCompra(compra_id: number): Promise<PagoListItem[]> {
  return apiFetch(`/compras/${compra_id}/pagos`)
}

export async function deletePago(pago_id: number): Promise<{ message: string; saldo_pendiente: number }> {
  return apiFetch(`/compras/pagos/${pago_id}`, { method: 'DELETE' })
}

// ===== PERMISSIONS API =====
export type Permission = {
  permission: string
  description: string
}

export type RolePermission = {
  role: string
  permissions: string[]
}

export async function listAvailablePermissions(): Promise<Permission[]> {
  return apiFetch('/permissions/available')
}

export async function listRolePermissions(): Promise<RolePermission[]> {
  return apiFetch('/permissions/roles')
}

export async function getRolePermissions(role: string): Promise<RolePermission> {
  return apiFetch(`/permissions/roles/${role}`)
}

export async function getMyPermissions(): Promise<string[]> {
  return apiFetch('/permissions/my-permissions')
}

// ===== ROLES API =====
export type Role = {
  id: number
  name: string
  description?: string | null
  active: boolean
  is_system: boolean
  created_at: string
  updated_at: string
  permissions: string[]
}

export type RoleIn = {
  name: string
  description?: string | null
  active?: boolean
  permissions: string[]
}

export type RoleUpdate = {
  name?: string
  description?: string | null
  active?: boolean
  permissions?: string[]
}

export async function listRoles(active?: boolean): Promise<Role[]> {
  const params = new URLSearchParams()
  if (active !== undefined) params.append('active', String(active))
  const query = params.toString()
  return apiFetch(`/roles${query ? `?${query}` : ''}`)
}

export async function getRole(role_id: number): Promise<Role> {
  return apiFetch(`/roles/${role_id}`)
}

export async function createRole(data: RoleIn): Promise<Role> {
  return apiFetch('/roles', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateRole(role_id: number, data: RoleUpdate): Promise<Role> {
  return apiFetch(`/roles/${role_id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteRole(role_id: number): Promise<void> {
  await apiFetch(`/roles/${role_id}`, { method: 'DELETE' })
}

export async function addPermissionToRole(role_id: number, permission: string): Promise<Role> {
  return apiFetch(`/roles/${role_id}/permissions?permission=${encodeURIComponent(permission)}`, { method: 'POST' })
}

export async function removePermissionFromRole(role_id: number, permission: string): Promise<void> {
  await apiFetch(`/roles/${role_id}/permissions/${encodeURIComponent(permission)}`, { method: 'DELETE' })
}

// ===== REPORTS API =====
export type DashboardSummary = {
  metrics: {
    cash_and_banks: number
    igv_por_pagar: number
    accounts_receivable: number
    accounts_payable: number
    total_purchases: number
    total_sales: number
  }
  recent_activities: Array<{
    type: string
    description: string
    amount: number
    date: string
    status: string
  }>
  recent_purchases?: Array<{
    id: number
    doc_type: string
    series: string
    number: string
    issue_date: string
    total_amount: number
    supplier_id: number
  }>
  recent_sales?: Array<{
    id: number
    doc_type: string
    series: string
    number: string
    issue_date: string
    total_amount: number
    customer_id: number
  }>
  closing_status?: Array<{
    task: string
    description: string
    status: string
    icon: string
  }>
  period_status?: string
}

export async function getDashboardSummary(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<DashboardSummary> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reportes/dashboard?${q.toString()}`)
}

// ===== EMPRESA DASHBOARD (usuarios de empresa) =====
export type EmpresaDashboardData = {
  company_id: number
  company_name: string | null
  period: string | null
  period_id: number | null
  financial: {
    cash_and_banks: number
    igv_por_pagar: number
    accounts_receivable: number
    accounts_payable: number
    total_purchases: number
    total_sales: number
  }
  mailbox_status: { unread_count: number; pending_response_count: number }
  quick_links: Array<{ label: string; path: string }>
}

export async function getEmpresaDashboard(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<EmpresaDashboardData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/empresa/dashboard?${q.toString()}`)
}

// ===== PAYMENT METHOD ENUM =====
export enum PaymentMethod {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
  TARJETA = 'TARJETA',
  YAPE = 'YAPE',
  PLIN = 'PLIN',
  OTRO = 'OTRO'
}

// ===== IGV PAYMENTS API =====
export type IGVPaymentIn = {
  payment_date: string
  amount: number
  payment_method?: string
  cash_account_code?: string
  payment_reference?: string | null
  notes?: string | null
  period_reference?: string | null
  use_detractions?: boolean  // Si True, usa detracciones para pagar IGV
  detraction_amount?: number | null  // Monto de detracciones a usar (si use_detractions=True)
}

export type IGVPaymentOut = {
  journal_entry_id: number
  payment_date: string
  amount: number
  period_reference: string | null
}

export async function registerIGVPayment(data: IGVPaymentIn): Promise<IGVPaymentOut> {
  return apiFetch('/reportes/igv-payment', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function getIGVPorPagar(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<{ igv_por_pagar: number; period: string | null }> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reportes/igv-por-pagar?${q.toString()}`)
}

export async function listIGVPayments(params: {
  company_id: number
  period?: string
}): Promise<Array<{
  id: number
  payment_date: string
  amount: number
  glosa: string
  period_id: number
}>> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  return apiFetch(`/reportes/igv-payments?${q.toString()}`)
}

// ===== DETRACCIONES API =====
export type DetractionsSummary = {
  detracciones_acumuladas: number
  detracciones_usadas: number
  detracciones_disponibles: number
  detracciones_por_periodo: Array<{
    period: string
    amount: number
  }>
}

export type DetractionUsage = {
  id: number
  usage_date: string
  amount: number
  journal_entry_id: number
  period_reference: string | null
  notes: string | null
  created_at: string
}

export async function getDetractionsSummary(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<DetractionsSummary> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reportes/detractions/summary?${q.toString()}`)
}

export async function getDetractionsAvailable(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<{ detracciones_disponibles: number; period: string | null }> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reportes/detractions/available?${q.toString()}`)
}

export async function listDetractionsUsage(params: {
  company_id: number
  period?: string
}): Promise<DetractionUsage[]> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  return apiFetch(`/reportes/detractions/usage?${q.toString()}`)
}

// ===== BANK RECONCILIATION API =====

export type BankAccount = {
  id: number
  company_id: number
  account_id: number
  bank_name: string
  account_number: string
  currency: string
  active: boolean
  account_code?: string
  account_name?: string
}

export type BankAccountIn = {
  company_id: number
  account_id: number
  bank_name: string
  account_number: string
  currency?: string
}

export type BankTransactionIn = {
  transaction_date: string
  description: string
  reference?: string
  debit: number
  credit: number
  balance: number
}

export type BankStatementIn = {
  bank_account_id: number
  period_id: number
  statement_date: string
  opening_balance: number
  closing_balance: number
  transactions: BankTransactionIn[]
}

export type ReconciliationSummary = {
  book_balance: number
  bank_balance: number
  pending_debits: number
  pending_credits: number
  reconciled_balance: number
}

export type BankTransactionOut = {
  id: number
  transaction_date: string
  description: string
  reference: string | null
  debit: number
  credit: number
  balance: number
  reconciled: boolean
  entry_line_id: number | null
  matched_entry_glosa: string | null
  matched_entry_date: string | null
}

export type EntryLineOut = {
  id: number
  entry_id: number
  account_id: number
  account_code: string | null
  account_name: string | null
  debit: number
  credit: number
  memo: string | null
  entry_date: string
  entry_glosa: string
  entry_number: string | null
  reconciled: boolean
}

export type MatchSuggestion = {
  bank_transaction_id: number
  entry_line_id: number
  confidence: number
  reason: string
}

export type MatchRequest = {
  bank_transaction_id: number
  entry_line_id: number
}

export type BulkMatchRequest = {
  matches: MatchRequest[]
}

export type FinalizeReconciliationRequest = {
  pending_debits?: number
  pending_credits?: number
  notes?: string | null
}

export async function listBankAccounts(company_id: number): Promise<BankAccount[]> {
  return apiFetch(`/bank-reconciliation/bank-accounts?company_id=${company_id}`)
}

export async function createBankAccount(data: BankAccountIn): Promise<BankAccount> {
  return apiFetch('/bank-reconciliation/bank-accounts', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function uploadBankStatement(data: BankStatementIn): Promise<{ id: number; status: string; transaction_count: number }> {
  return apiFetch('/bank-reconciliation/upload-statement', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function getReconciliationSummary(bank_account_id: number, period_id: number): Promise<ReconciliationSummary> {
  return apiFetch(`/bank-reconciliation/reconciliation-summary/${bank_account_id}?period_id=${period_id}`)
}

export async function getUnreconciledTransactions(bank_account_id: number, period_id: number): Promise<BankTransactionOut[]> {
  return apiFetch(`/bank-reconciliation/transactions/${bank_account_id}?period_id=${period_id}`)
}

export async function getUnreconciledEntryLines(bank_account_id: number, period_id: number): Promise<EntryLineOut[]> {
  return apiFetch(`/bank-reconciliation/entry-lines/${bank_account_id}?period_id=${period_id}`)
}

export async function getAutoMatchSuggestions(bank_account_id: number, period_id: number): Promise<MatchSuggestion[]> {
  return apiFetch(`/bank-reconciliation/auto-match/${bank_account_id}?period_id=${period_id}`)
}

export async function createMatch(data: MatchRequest): Promise<{ success: boolean; message: string }> {
  return apiFetch('/bank-reconciliation/match', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function createBulkMatches(data: BulkMatchRequest): Promise<{ success: boolean; success_count: number; error_count: number; errors: string[] }> {
  return apiFetch('/bank-reconciliation/bulk-match', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function removeMatch(bank_transaction_id: number): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/bank-reconciliation/match/${bank_transaction_id}`, {
    method: 'DELETE'
  })
}

export type ReconciledMatch = {
  bank_transaction_id: number
  transaction_date: string
  transaction_description: string
  transaction_reference: string | null
  transaction_amount: number
  transaction_type: 'debit' | 'credit'
  entry_line_id: number
  entry_date: string
  entry_glosa: string
  entry_memo: string | null
  entry_amount: number
  entry_type: 'debit' | 'credit'
  amount_difference: number
  entry_number: string | null
}

export type ReconciledMatchDetail = {
  bank_transaction: {
    id: number
    date: string
    description: string
    reference: string | null
    amount: number
    type: 'debit' | 'credit'
    balance: number
  }
  entry_line: {
    id: number
    date: string
    glosa: string
    memo: string | null
    amount: number
    type: 'debit' | 'credit'
    account_code: string
    account_name: string
  }
  journal_entry: {
    id: number
    number: string
    date: string
    glosa: string
    status: string
  }
  statement: {
    id: number
    date: string
    period: string | null
  }
  bank_account: {
    id: number
    bank_name: string
    account_number: string
  }
  reconciliation: {
    amount_difference: number
    amounts_match: boolean
    has_warning: boolean
  }
}

export async function listReconciledMatches(bank_account_id: number, period_id?: number): Promise<ReconciledMatch[]> {
  const url = period_id 
    ? `/bank-reconciliation/reconciled-matches/${bank_account_id}?period_id=${period_id}`
    : `/bank-reconciliation/reconciled-matches/${bank_account_id}`
  return apiFetch(url)
}

export async function getReconciledMatchDetail(bank_transaction_id: number): Promise<ReconciledMatchDetail> {
  return apiFetch(`/bank-reconciliation/reconciled-match-detail/${bank_transaction_id}`)
}

export async function finalizeReconciliation(bank_account_id: number, period_id: number, data: FinalizeReconciliationRequest): Promise<{ success: boolean; status: string; reconciled_balance: number; bank_balance: number; difference: number; unreconciled_lines_warning?: number | null }> {
  return apiFetch(`/bank-reconciliation/finalize/${bank_account_id}?period_id=${period_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function generateBankReconciliationTestData(bank_account_id: number, period_id: number): Promise<{ success: boolean; message: string; statement_id: number; transactions_count: number; entries_created: number; opening_balance: number; closing_balance: number }> {
  return apiFetch(`/bank-reconciliation/generate-test-data?bank_account_id=${bank_account_id}&period_id=${period_id}`, {
    method: 'POST'
  })
}

export async function downloadReconciliationExcel(bank_account_id: number, period_id: number): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/bank-reconciliation/export/excel?bank_account_id=${bank_account_id}&period_id=${period_id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export type TrialBalanceRow = {
  account_code: string
  name: string
  debit: number
  credit: number
  balance: number
}

export async function getTrialBalance(params: {
  company_id: number
  period?: string
  period_id?: number
  include_zero?: boolean
}): Promise<TrialBalanceRow[]> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  if (params.include_zero) q.set('include_zero', 'true')
  return apiFetch(`/reports/trial-balance?${q.toString()}`)
}

export async function downloadTrialBalanceExcel(params: {
  company_id: number
  period?: string
  period_id?: number
  include_zero?: boolean
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  if (params.include_zero) q.set('include_zero', 'true')
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/trial-balance/excel?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadTrialBalancePdf(params: {
  company_id: number
  period?: string
  period_id?: number
  include_zero?: boolean
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  if (params.include_zero) q.set('include_zero', 'true')
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/trial-balance/pdf?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export type LedgerRow = {
  entry_id: number
  date: string
  account_code: string
  debit: number
  credit: number
  balance: number
  memo?: string
  glosa: string
}

export async function getLedger(params: {
  company_id: number
  account_code: string
  period?: string
  period_id?: number
}): Promise<LedgerRow[]> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('account_code', params.account_code)
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reports/ledger?${q.toString()}`)
}

export type IncomeStatement = {
  period: string
  ingresos: Array<{ account_code: string; name: string; amount: number; is_income: boolean }>
  gastos: Array<{ account_code: string; name: string; amount: number; is_income: boolean }>
  total_ingresos: number
  total_gastos: number
  utilidad_neta: number
}

export async function getIncomeStatement(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<IncomeStatement> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reports/income-statement?${q.toString()}`)
}

export type BalanceSheet = {
  period: string
  activos: Array<{ account_code: string; name: string; amount: number }>
  pasivos: Array<{ account_code: string; name: string; amount: number }>
  patrimonio: Array<{ account_code: string; name: string; amount: number }>
  total_activos: number
  total_pasivos: number
  total_patrimonio: number
  total_pasivos_patrimonio: number
  balanceado: boolean
}

export async function getBalanceSheet(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<BalanceSheet> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reports/balance-sheet?${q.toString()}`)
}

export type IGVSummary = {
  period: string
  igv_credito_fiscal: number
  igv_debito_fiscal: number
  igv_pagar: number
  igv_saldo_favor: number
}

export async function getIGVSummary(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<IGVSummary> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  return apiFetch(`/reports/igv-summary?${q.toString()}`)
}

// Funciones de exportación adicionales
export async function downloadIncomeStatementExcel(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/income-statement/excel?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadIncomeStatementPdf(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/income-statement/pdf?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadBalanceSheetExcel(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/balance-sheet/excel?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadBalanceSheetPdf(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/balance-sheet/pdf?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadIGVSummaryExcel(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/igv-summary/excel?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadIGVSummaryPdf(params: {
  company_id: number
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/igv-summary/pdf?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadLedgerExcel(params: {
  company_id: number
  account_code: string
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('account_code', params.account_code)
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/ledger/excel?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function downloadLedgerPdf(params: {
  company_id: number
  account_code: string
  period?: string
  period_id?: number
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('account_code', params.account_code)
  if (params.period) q.set('period', params.period)
  if (params.period_id) q.set('period_id', String(params.period_id))
  const token = getToken()
  const res = await fetch(`${API_BASE}/reports/ledger/pdf?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

// ===== PLE API =====
export type PLEData = {
  libro: string
  nombre: string
  periodo: string
  company_id: number
  registros: number
  rows: string[][]
}

export async function getPLELibroDiario(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/libro-diario?${q.toString()}`)
}

export async function downloadPLELibroDiario(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/libro-diario.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function getPLELibroMayor(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/libro-mayor?${q.toString()}`)
}

export async function downloadPLELibroMayor(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/libro-mayor.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function getPLEPlanCuentas(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/plan-cuentas?${q.toString()}`)
}

export async function downloadPLEPlanCuentas(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/plan-cuentas.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function getPLERegistroCompras(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/compras?${q.toString()}`)
}

export async function downloadPLERegistroCompras(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/compras.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function getPLERegistroVentas(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/ventas?${q.toString()}`)
}

export async function downloadPLERegistroVentas(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/ventas.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function getPLECajaBancos(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/caja-bancos?${q.toString()}`)
}

export async function downloadPLECajaBancos(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/caja-bancos.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

export async function getPLEInventariosBalances(params: {
  company_id: number
  period: string
}): Promise<PLEData> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  return apiFetch(`/ple/inventarios-balances?${q.toString()}`)
}

export async function downloadPLEInventariosBalances(params: {
  company_id: number
  period: string
}): Promise<Blob> {
  const q = new URLSearchParams()
  q.set('company_id', String(params.company_id))
  q.set('period', params.period)
  const token = getToken()
  const res = await fetch(`${API_BASE}/ple/inventarios-balances.txt?${q.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`)
  return res.blob()
}

// ===== SETUP / DATOS DE PRUEBA =====
export async function cleanupAccountingData(
  company_id: number,
  keep_companies: boolean = true,
  keep_third_parties: boolean = true,
  keep_products: boolean = false
): Promise<{
  message: string
  company_id: number
  deleted: {
    entry_lines: number
    journal_entries: number
    purchases: number
    sales: number
    inventory_movements: number
    products: number
    third_parties: number
    bank_reconciliations: number
    bank_transactions: number
    bank_statements: number
    bank_accounts: number
  }
}> {
  const params = new URLSearchParams()
  params.set('company_id', String(company_id))
  params.set('keep_companies', String(keep_companies))
  params.set('keep_third_parties', String(keep_third_parties))
  params.set('keep_products', String(keep_products))
  return apiFetch(`/setup/cleanup-data?${params.toString()}`, { method: 'POST' })
}

export async function generateTestData(
  company_id: number,
  period: string,
  num_asientos: number = 10,
  num_compras: number = 5,
  num_ventas: number = 5
): Promise<{
  message: string
  company_id: number
  period: string
  generated: {
    journal_entries: number
    purchases: number
    sales: number
    third_parties: number
    products: number
  }
  summary: {
    total_entries: number
    total_purchases: number
    total_sales: number
    total_third_parties: number
    total_products: number
  }
}> {
  const params = new URLSearchParams()
  params.set('company_id', String(company_id))
  params.set('period', period)
  params.set('num_asientos', String(num_asientos))
  params.set('num_compras', String(num_compras))
  params.set('num_ventas', String(num_ventas))
  return apiFetch(`/setup/generate-test-data?${params.toString()}`, { method: 'POST' })
}

export async function getSetupStatus(): Promise<{ setup_required: boolean; reason?: string }> {
  return apiFetch('/setup/status')
}

export async function getSuggestedConfig(): Promise<{
  db_host: string
  db_port: number
  db_user: string
  db_name: string
  admin_user: string
}> {
  return apiFetch('/setup/suggested-config')
}

export async function firstTimeSetup(params: {
  db_host: string
  db_port: number
  db_user: string
  db_password: string
  db_name: string
  admin_user: string
  admin_pass: string
}): Promise<{ message: string; admin_user: string; restart_required: boolean }> {
  return apiFetch('/setup/first-time-setup', { method: 'POST', body: JSON.stringify(params) })
}

export async function initDatabase(): Promise<{
  message: string
  admin_user: string
  hint: string
}> {
  return apiFetch('/setup/init-database', { method: 'POST' })
}

export async function resetForFirstTime(): Promise<{
  message: string
  hint: string
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000) // 90 segundos
  try {
    const result = await apiFetch('/setup/reset-for-first-time', {
      method: 'POST',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return result
  } catch (e: any) {
    clearTimeout(timeout)
    if (e?.name === 'AbortError') {
      throw new Error('La operación tardó demasiado. Reinicia la página y verifica si el reset se completó (revisa el backend).')
    }
    throw e
  }
}

export async function listDbDumps(): Promise<{
  dumps: { filename: string; size_mb: number; modified: string }[]
  message?: string
}> {
  return apiFetch('/setup/db-dumps')
}

export async function restoreDatabase(filename: string): Promise<{
  message: string
  filename: string
  stdout_preview?: string
}> {
  return apiFetch(`/setup/restore-database?filename=${encodeURIComponent(filename)}`, { method: 'POST' })
}

// ===== TERCEROS API (Proveedores y Clientes) =====
export type ThirdParty = {
  id: number
  company_id: number
  tax_id: string  // RUC o DNI
  tax_id_type: string  // Catálogo 06 SUNAT: 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero
  name: string
  type: string  // PROVEEDOR o CLIENTE
  commercial_name?: string | null
  address?: string | null
  district?: string | null
  province?: string | null
  department?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  contact_person?: string | null
  country_code?: string | null  // País de residencia según Catálogo 18 SUNAT (PE=Perú)
  third_party_type?: string | null  // Nacional, Extranjero, No domiciliado
  sunat_status?: string | null  // Estado SUNAT: Habido, No habido (solo para proveedores)
  active: boolean
  notes?: string | null
}

export type ThirdPartyIn = {
  company_id: number
  tax_id: string
  tax_id_type?: string  // Catálogo 06 SUNAT: 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero
  name: string
  type?: string
  commercial_name?: string | null
  address?: string | null
  district?: string | null
  province?: string | null
  department?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  contact_person?: string | null
  country_code?: string | null
  third_party_type?: string | null
  sunat_status?: string | null
  active?: boolean
  notes?: string | null
}

export type ThirdPartyUpdate = {
  tax_id?: string
  tax_id_type?: string
  name?: string
  type?: string
  commercial_name?: string | null
  address?: string | null
  district?: string | null
  province?: string | null
  department?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  contact_person?: string | null
  country_code?: string | null
  third_party_type?: string | null
  sunat_status?: string | null
  active?: boolean
  notes?: string | null
}

export type ThirdPartyStats = {
  total: number
  proveedores: number
  clientes: number
  activos: number
  inactivos: number
}

export async function listThirdParties(
  company_id: number,
  type?: string,
  active?: boolean,
  search?: string
): Promise<ThirdParty[]> {
  const params = new URLSearchParams({ company_id: String(company_id) })
  if (type) params.append('type', type)
  if (active !== undefined) params.append('active', String(active))
  if (search) params.append('search', search)
  return apiFetch(`/terceros?${params}`)
}

export async function getThirdParty(tercero_id: number): Promise<ThirdParty> {
  return apiFetch(`/terceros/${tercero_id}`)
}

export async function createThirdParty(data: ThirdPartyIn): Promise<ThirdParty> {
  return apiFetch('/terceros', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateThirdParty(id: number, data: ThirdPartyUpdate): Promise<ThirdParty> {
  return apiFetch(`/terceros/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteThirdParty(id: number): Promise<void> {
  await apiFetch(`/terceros/${id}`, { method: 'DELETE' })
}

export async function getThirdPartiesStats(company_id: number): Promise<ThirdPartyStats> {
  return apiFetch(`/terceros/stats/${company_id}`)
}

// ===== SETTINGS API =====
export type SystemSettings = {
  id: number
  company_id: number
  number_thousand_separator: string
  number_decimal_separator: string
  number_decimal_places: number
  currency_code: string
  currency_symbol: string
  date_format: string
  default_igv_rate: number
  fiscal_year_start_month: number
  allow_edit_closed_periods: boolean
  auto_generate_journal_entries: boolean
  require_period_validation: boolean
  extra_settings?: Record<string, any> | null
}

export type SystemSettingsIn = {
  number_thousand_separator?: string
  number_decimal_separator?: string
  number_decimal_places?: number
  currency_code?: string
  currency_symbol?: string
  date_format?: string
  default_igv_rate?: number
  fiscal_year_start_month?: number
  allow_edit_closed_periods?: boolean
  auto_generate_journal_entries?: boolean
  require_period_validation?: boolean
  extra_settings?: Record<string, any> | null
}

export async function getSystemSettings(company_id: number): Promise<SystemSettings> {
  return apiFetch(`/settings/company/${company_id}`)
}

export async function updateSystemSettings(company_id: number, data: SystemSettingsIn): Promise<SystemSettings> {
  return apiFetch(`/settings/company/${company_id}`, { method: 'PUT', body: JSON.stringify(data) })
}

// ===== DOCUMENTS API =====
export type Document = {
  id: number
  original_filename: string
  document_type: string
  document_category?: string | null
  title?: string | null
  description?: string | null
  file_size: number
  mime_type: string
  related_entity_type?: string | null
  related_entity_id?: number | null
  uploaded_at: string
  uploaded_by: number
  extracted_data?: Record<string, any> | null
  metadata?: Record<string, any> | null
  tags?: string[]
}

export type DocumentSearchParams = {
  company_id: number
  query?: string
  document_type?: string
  related_entity_type?: string
  related_entity_id?: number
  date_from?: string
  date_to?: string
  tags?: string
  limit?: number
  offset?: number
}

export type DocumentSearchResponse = {
  items: Document[]
  total: number
  limit: number
  offset: number
}

export async function uploadDocument(
  companyId: number,
  file: File,
  documentType: string,
  relatedEntityType?: string,
  relatedEntityId?: number,
  title?: string,
  description?: string
): Promise<Document> {
  const formData = new FormData()
  formData.append('file', file)
  
  const params = new URLSearchParams()
  params.append('company_id', companyId.toString())
  params.append('document_type', documentType)
  if (relatedEntityType) params.append('related_entity_type', relatedEntityType)
  if (relatedEntityId) params.append('related_entity_id', relatedEntityId.toString())
  if (title) params.append('title', title)
  if (description) params.append('description', description)
  
  const token = getToken()
  const res = await fetch(`${API_BASE}/documents/upload?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })
  
  if (res.status === 401) {
    handleAuthError()
    throw new Error('Sesión expirada')
  }
  
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  
  return res.json()
}

export async function getDocument(id: number): Promise<Document> {
  return apiFetch(`/documents/${id}`)
}

export async function downloadDocument(id: number): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/documents/${id}/download`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  
  if (res.status === 401) {
    handleAuthError()
    throw new Error('Sesión expirada')
  }
  
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  
  return res.blob()
}

export async function previewDocument(id: number): Promise<string> {
  const token = getToken()
  const blob = await downloadDocument(id)
  return URL.createObjectURL(blob)
}

export async function searchDocuments(params: DocumentSearchParams): Promise<DocumentSearchResponse> {
  const queryParams = new URLSearchParams()
  queryParams.append('company_id', params.company_id.toString())
  if (params.query) queryParams.append('query', params.query)
  if (params.document_type) queryParams.append('document_type', params.document_type)
  if (params.related_entity_type) queryParams.append('related_entity_type', params.related_entity_type)
  if (params.related_entity_id) queryParams.append('related_entity_id', params.related_entity_id.toString())
  if (params.date_from) queryParams.append('date_from', params.date_from)
  if (params.date_to) queryParams.append('date_to', params.date_to)
  if (params.tags) queryParams.append('tags', params.tags)
  if (params.limit) queryParams.append('limit', params.limit.toString())
  if (params.offset) queryParams.append('offset', params.offset.toString())
  
  return apiFetch(`/documents/search?${queryParams.toString()}`)
}

export async function deleteDocument(id: number, softDelete: boolean = true): Promise<void> {
  return apiFetch(`/documents/${id}?soft_delete=${softDelete}`, { method: 'DELETE' })
}

export async function addDocumentTag(id: number, tag: string): Promise<{ message: string; tag: string }> {
  return apiFetch(`/documents/${id}/tags?tag=${encodeURIComponent(tag)}`, { method: 'POST' })
}

export async function removeDocumentTag(id: number, tag: string): Promise<void> {
  return apiFetch(`/documents/${id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' })
}

export async function getPurchaseDocuments(purchaseId: number): Promise<DocumentSearchResponse> {
  return apiFetch(`/documents/compras/${purchaseId}`)
}

export async function getSaleDocuments(saleId: number): Promise<DocumentSearchResponse> {
  return apiFetch(`/documents/ventas/${saleId}`)
}

// ===== SIRE API =====

export type SireConfiguration = {
  id: number
  company_id: number
  // Credenciales del generador
  ruc?: string | null
  usuario_generador?: string | null
  // password_generador no se incluye por seguridad (siempre se muestra vacío)
  auto_sync_enabled: boolean
  sync_frequency_hours: number
  email_notifications: boolean
  notification_emails?: string | null
  use_test_env: boolean  // True = usar Preliminares (modo seguro), False = operaciones definitivas
  last_sync_date?: string | null
}

export type SireConfigurationIn = {
  // Credenciales del generador (requeridas según manual SUNAT)
  ruc?: string
  usuario_generador?: string
  password_generador?: string
  
  // Credenciales OAuth
  oauth_client_id: string
  oauth_client_secret: string
  
  // Configuración
  auto_sync_enabled?: boolean
  sync_frequency_hours?: number
  email_notifications?: boolean
  notification_emails?: string | null
  use_test_env?: boolean  // True = usar Preliminares (modo seguro), False = operaciones definitivas
}

export type SireProposal = {
  id: number
  sunat_proposal_id: string
  sunat_correlative?: string | null
  proposal_date: string
  status: string
  proposal_data: any
  response_data?: any | null
  response_date?: string | null
  sale_id?: number | null
  purchase_id?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export type SireSyncRequest = {
  proposal_type: 'RVIE' | 'RCE'
  date_from?: string | null
  date_to?: string | null
  periods?: string[]  // Lista de períodos tributarios a sincronizar (ej: ["202401", "202402"])
}

export type SireSyncResponse = {
  success: boolean
  records_processed: number
  records_success: number
  records_failed: number
  errors: Array<{ proposal_id: string; error: string }>
}

export type SireProposalActionRequest = {
  additional_data?: any | null
  replacement_data?: any | null
  notes?: string | null
}

export type SireSyncLog = {
  id: number
  sync_type: string
  sync_date: string
  records_processed: number
  records_success: number
  records_failed: number
  status: string
  error_message?: string | null
}

// Configuración
export async function getSireConfiguration(company_id: number): Promise<SireConfiguration> {
  return apiFetch(`/sire/configuration?company_id=${company_id}`)
}

export async function createSireConfiguration(company_id: number, data: SireConfigurationIn): Promise<SireConfiguration> {
  return apiFetch(`/sire/configuration?company_id=${company_id}`, { method: 'POST', body: JSON.stringify(data) })
}

// Sincronización
export async function syncSireProposals(company_id: number, data: SireSyncRequest): Promise<SireSyncResponse> {
  return apiFetch(`/sire/sync?company_id=${company_id}`, { method: 'POST', body: JSON.stringify(data) })
}

// Propuestas RVIE
export async function listRVIEProposals(params: {
  company_id: number
  status?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}): Promise<SireProposal[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.status) queryParams.set('status', params.status)
  if (params.date_from) queryParams.set('date_from', params.date_from)
  if (params.date_to) queryParams.set('date_to', params.date_to)
  if (params.limit) queryParams.set('limit', params.limit.toString())
  if (params.offset) queryParams.set('offset', params.offset.toString())
  return apiFetch(`/sire/rvie/proposals?${queryParams.toString()}`)
}

export async function getRVIEProposal(proposal_id: number, company_id: number): Promise<SireProposal> {
  return apiFetch(`/sire/rvie/proposals/${proposal_id}?company_id=${company_id}`)
}

export async function acceptRVIEProposal(proposal_id: number, company_id: number, data?: SireProposalActionRequest): Promise<any> {
  return apiFetch(`/sire/rvie/proposals/${proposal_id}/accept?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data || {})
  })
}

export async function complementRVIEProposal(proposal_id: number, company_id: number, data: SireProposalActionRequest): Promise<any> {
  return apiFetch(`/sire/rvie/proposals/${proposal_id}/complement?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function replaceRVIEProposal(proposal_id: number, company_id: number, data: SireProposalActionRequest): Promise<any> {
  return apiFetch(`/sire/rvie/proposals/${proposal_id}/replace?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

// Propuestas RCE
export async function listRCEProposals(params: {
  company_id: number
  status?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}): Promise<SireProposal[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.status) queryParams.set('status', params.status)
  if (params.date_from) queryParams.set('date_from', params.date_from)
  if (params.date_to) queryParams.set('date_to', params.date_to)
  if (params.limit) queryParams.set('limit', params.limit.toString())
  if (params.offset) queryParams.set('offset', params.offset.toString())
  return apiFetch(`/sire/rce/proposals?${queryParams.toString()}`)
}

export async function getRCEProposal(proposal_id: number, company_id: number): Promise<SireProposal> {
  return apiFetch(`/sire/rce/proposals/${proposal_id}?company_id=${company_id}`)
}

export async function acceptRCEProposal(proposal_id: number, company_id: number, data?: SireProposalActionRequest): Promise<any> {
  return apiFetch(`/sire/rce/proposals/${proposal_id}/accept?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data || {})
  })
}

export async function complementRCEProposal(proposal_id: number, company_id: number, data: SireProposalActionRequest): Promise<any> {
  return apiFetch(`/sire/rce/proposals/${proposal_id}/complement?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function replaceRCEProposal(proposal_id: number, company_id: number, data: SireProposalActionRequest): Promise<any> {
  return apiFetch(`/sire/rce/proposals/${proposal_id}/replace?company_id=${company_id}`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

// Logs de sincronización
export async function listSireSyncLogs(params: {
  company_id: number
  sync_type?: string
  limit?: number
}): Promise<SireSyncLog[]> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.sync_type) queryParams.set('sync_type', params.sync_type)
  if (params.limit) queryParams.set('limit', params.limit.toString())
  return apiFetch(`/sire/sync-logs?${queryParams.toString()}`)
}

export async function getSirePeriods(company_id: number, proposal_type: 'RVIE' | 'RCE'): Promise<any> {
  return apiFetch(`/sire/periods?company_id=${company_id}&proposal_type=${proposal_type}`)
}

// ===== TESORERÍA API =====
export type MetodoPago = {
  id: number
  company_id: number
  codigo: string
  descripcion: string
  impacta_en: 'CAJA' | 'BANCO'
  activo: boolean
}

export type MovimientoTesoreria = {
  id: number
  tipo: 'COBRO' | 'PAGO' | 'TRANSFERENCIA'
  referencia_tipo: 'VENTA' | 'COMPRA'
  referencia_id: number
  monto: number
  fecha: string
  metodo_pago_id: number
  metodo_pago_codigo: string
  metodo_pago_descripcion: string
  estado: string
  journal_entry_id: number | null
  glosa: string | null
  created_at: string
}

export type CobroTesoreriaIn = {
  company_id: number
  venta_id: number
  monto: number
  fecha: string
  metodo_pago_id: number
  glosa?: string
  usar_motor?: boolean
}

export type PagoTesoreriaIn = {
  company_id: number
  compra_id: number
  monto: number
  fecha: string
  metodo_pago_id: number
  glosa?: string
  usar_motor?: boolean
}

export type MovimientosTesoreriaResponse = {
  success: boolean
  total: number
  movimientos: MovimientoTesoreria[]
}

export async function listMetodosPago(company_id: number): Promise<MetodoPago[]> {
  return apiFetch(`/tesoreria/metodos-pago?company_id=${company_id}`)
}

export async function initMetodosPago(company_id: number): Promise<{ creados: number; ya_existian: number; total: number; mensaje: string }> {
  return apiFetch(`/tesoreria/init-metodos-pago?company_id=${company_id}`, { method: 'POST' })
}

export async function registrarCobroTesoreria(data: CobroTesoreriaIn): Promise<{ success: boolean; movimiento: MovimientoTesoreria; journal_entry: { id: number; origin: string; glosa: string } | null }> {
  return apiFetch('/tesoreria/cobros', { method: 'POST', body: JSON.stringify(data) })
}

export async function registrarPagoTesoreria(data: PagoTesoreriaIn): Promise<{ success: boolean; movimiento: MovimientoTesoreria; journal_entry: { id: number; origin: string; glosa: string } | null }> {
  return apiFetch('/tesoreria/pagos', { method: 'POST', body: JSON.stringify(data) })
}

export async function listMovimientosTesoreria(params: {
  company_id: number
  tipo?: 'COBRO' | 'PAGO' | 'TRANSFERENCIA'
  referencia_tipo?: 'VENTA' | 'COMPRA'
  referencia_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<MovimientosTesoreriaResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.tipo) queryParams.set('tipo', params.tipo)
  if (params.referencia_tipo) queryParams.set('referencia_tipo', params.referencia_tipo)
  if (params.referencia_id) queryParams.set('referencia_id', params.referencia_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/tesoreria/movimientos?${queryParams.toString()}`)
}

export async function getSaldoPendienteVentaTesoreria(venta_id: number, company_id: number): Promise<{ saldo_pendiente: number }> {
  return apiFetch(`/tesoreria/saldo-pendiente-venta/${venta_id}?company_id=${company_id}`)
}

export async function getSaldoPendienteCompraTesoreria(compra_id: number, company_id: number): Promise<{ saldo_pendiente: number }> {
  return apiFetch(`/tesoreria/saldo-pendiente-compra/${compra_id}?company_id=${company_id}`)
}

export async function eliminarMovimientoTesoreria(movimiento_id: number, company_id: number): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/tesoreria/movimientos/${movimiento_id}?company_id=${company_id}`, { method: 'DELETE' })
}

export async function eliminarMovimientosTesoreriaMasivo(movimiento_ids: number[], company_id: number): Promise<{ success: boolean; eliminados: number; total_solicitados: number; errores: string[]; message: string }> {
  // FastAPI acepta múltiples parámetros con el mismo nombre usando ?movimiento_ids=1&movimiento_ids=2&movimiento_ids=3
  const params = new URLSearchParams()
  params.set('company_id', company_id.toString())
  movimiento_ids.forEach(id => params.append('movimiento_ids', id.toString()))
  return apiFetch(`/tesoreria/movimientos/bulk?${params.toString()}`, { method: 'DELETE' })
}

// ===== NOTAS DE CRÉDITO Y DÉBITO API =====

export interface NotaDetalleIn {
  producto_id?: number | null
  cantidad?: number | null
  costo_unitario?: number | null
  costo_total?: number | null
  almacen_id?: number | null
  descripcion?: string | null
}

export interface NotaDocumentoOut {
  id: number
  company_id: number
  tipo: string
  origen: string
  documento_ref_id: number
  documento_ref_tipo: string
  serie: string
  numero: string
  fecha_emision: string
  motivo: string
  monto_base: number
  igv: number
  total: number
  afecta_inventario: boolean
  estado: string
  journal_entry_id?: number | null
  created_at: string
  detalles: Array<{
    id: number
    producto_id?: number | null
    cantidad?: number | null
    costo_unitario?: number | null
    costo_total?: number | null
    descripcion?: string | null
  }>
}

export interface NotaCreditoVentaIn {
  company_id: number
  venta_id: number
  serie: string
  numero: string
  fecha_emision: string
  motivo: string
  monto_base: number
  detalles?: NotaDetalleIn[] | null
  glosa?: string | null
  usar_motor?: boolean
}

export interface NotaDebitoVentaIn {
  company_id: number
  venta_id: number
  serie: string
  numero: string
  fecha_emision: string
  motivo: string
  monto_base: number
  glosa?: string | null
  usar_motor?: boolean
}

export interface NotaCreditoCompraIn {
  company_id: number
  compra_id: number
  serie: string
  numero: string
  fecha_emision: string
  motivo: string
  monto_base: number
  detalles?: NotaDetalleIn[] | null
  glosa?: string | null
  usar_motor?: boolean
}

export interface NotaDebitoCompraIn {
  company_id: number
  compra_id: number
  serie: string
  numero: string
  fecha_emision: string
  motivo: string
  monto_base: number
  glosa?: string | null
  usar_motor?: boolean
}

export async function registrarNotaCreditoVenta(data: NotaCreditoVentaIn): Promise<NotaDocumentoOut> {
  return apiFetch('/notas/credito/venta', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function registrarNotaDebitoVenta(data: NotaDebitoVentaIn): Promise<NotaDocumentoOut> {
  return apiFetch('/notas/debito/venta', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function registrarNotaCreditoCompra(data: NotaCreditoCompraIn): Promise<NotaDocumentoOut> {
  return apiFetch('/notas/credito/compra', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function registrarNotaDebitoCompra(data: NotaDebitoCompraIn): Promise<NotaDocumentoOut> {
  return apiFetch('/notas/debito/compra', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function getNota(nota_id: number): Promise<NotaDocumentoOut> {
  return apiFetch(`/notas/${nota_id}`)
}

export async function listNotasPorDocumento(
  documento_tipo: 'VENTA' | 'COMPRA',
  documento_id: number,
  company_id: number
): Promise<NotaDocumentoOut[]> {
  return apiFetch(`/notas/documento/${documento_tipo}/${documento_id}?company_id=${company_id}`)
}

export async function anularNota(
  nota_id: number,
  company_id: number
): Promise<{ message: string; nota_id: number; journal_entry_id: number | null }> {
  return apiFetch(`/notas/${nota_id}/anular?company_id=${company_id}`, { method: 'POST' })
}

export async function eliminarNota(
  nota_id: number,
  company_id: number
): Promise<{ message: string; nota_id: number; journal_entry_id: number | null }> {
  return apiFetch(`/notas/${nota_id}?company_id=${company_id}`, { method: 'DELETE' })
}

// ===== REPORTES =====
export interface LibroDiarioRow {
  fecha: string
  nro_asiento: number
  cuenta_codigo: string
  cuenta_nombre: string
  glosa: string
  debe: number
  haber: number
  periodo: string
  origen: string
}

export interface LibroDiarioResponse {
  success: boolean
  reporte: string
  datos: LibroDiarioRow[]
  totales: {
    total_debe: number
    total_haber: number
    diferencia: number
  }
  validacion: {
    cuadra: boolean
    mensaje: string
  }
  filtros_aplicados: any
}

export async function getLibroDiario(params: {
  company_id: number
  period_id?: number
  account_id?: number
  origin?: string
  currency?: string
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<LibroDiarioResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.period_id) queryParams.set('period_id', params.period_id.toString())
  if (params.account_id) queryParams.set('account_id', params.account_id.toString())
  if (params.origin) queryParams.set('origin', params.origin)
  if (params.currency) queryParams.set('currency', params.currency)
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/libro-diario?${queryParams.toString()}`)
}

export interface LibroMayorRow {
  account_id: number
  cuenta_codigo: string
  cuenta_nombre: string
  account_type: string
  saldo_inicial: number
  debe_total: number
  haber_total: number
  saldo_final: number
}

export interface LibroMayorResponse {
  success: boolean
  reporte: string
  datos: LibroMayorRow[]
  validacion: {
    valido: boolean
    errores: any[]
    mensaje: string
  }
  filtros_aplicados: any
}

export async function getLibroMayor(params: {
  company_id: number
  account_id?: number
  period_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<LibroMayorResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.account_id) queryParams.set('account_id', params.account_id.toString())
  if (params.period_id) queryParams.set('period_id', params.period_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/libro-mayor?${queryParams.toString()}`)
}

export interface BalanceComprobacionResponse {
  success: boolean
  reporte: string
  datos: LibroMayorRow[]
  validacion: {
    total_debe: number
    total_haber: number
    diferencia: number
    cuadra: boolean
    mensaje: string
  }
  filtros_aplicados: any
}

export async function getBalanceComprobacion(params: {
  company_id: number
  period_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<BalanceComprobacionResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.period_id) queryParams.set('period_id', params.period_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/balance-comprobacion?${queryParams.toString()}`)
}

export interface EstadoResultadosResponse {
  success: boolean
  reporte: string
  datos: {
    ingresos: Array<{ cuenta_codigo: string; cuenta_nombre: string; monto: number }>
    costos: Array<{ cuenta_codigo: string; cuenta_nombre: string; monto: number }>
    gastos: Array<{ cuenta_codigo: string; cuenta_nombre: string; monto: number }>
    totales: {
      total_ingresos: number
      total_costos: number
      total_gastos: number
      utilidad_bruta: number
      utilidad_neta: number
    }
  }
  filtros_aplicados: any
}

export async function getEstadoResultados(params: {
  company_id: number
  period_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<EstadoResultadosResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.period_id) queryParams.set('period_id', params.period_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/estado-resultados?${queryParams.toString()}`)
}

export interface BalanceGeneralResponse {
  success: boolean
  reporte: string
  datos: {
    activos: Array<{ cuenta_codigo: string; cuenta_nombre: string; saldo: number }>
    pasivos: Array<{ cuenta_codigo: string; cuenta_nombre: string; saldo: number }>
    patrimonio: Array<{ cuenta_codigo: string; cuenta_nombre: string; saldo: number }>
    totales: {
      total_activos: number
      total_pasivos: number
      total_patrimonio: number
      total_pasivo_patrimonio: number
    }
    validacion: {
      cuadra: boolean
      diferencia: number
      mensaje: string
    }
  }
  filtros_aplicados: any
}

export async function getBalanceGeneral(params: {
  company_id: number
  period_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<BalanceGeneralResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.period_id) queryParams.set('period_id', params.period_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/balance-general?${queryParams.toString()}`)
}

export interface AsientosDescuadradosResponse {
  success: boolean
  reporte: string
  datos: Array<{
    asiento_id: number
    fecha: string
    glosa: string
    origen: string
    total_debe: number
    total_haber: number
    diferencia: number
  }>
  total: number
  mensaje: string
  filtros_aplicados: any
}

export async function getAsientosDescuadrados(params: {
  company_id: number
  period_id?: number
}): Promise<AsientosDescuadradosResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.period_id) queryParams.set('period_id', params.period_id.toString())
  return apiFetch(`/reportes/asientos-descuadrados?${queryParams.toString()}`)
}

export interface MovimientosSinAsientoResponse {
  success: boolean
  reporte: string
  datos: {
    compras: any[]
    ventas: any[]
    inventario: any[]
    tesoreria: any[]
    notas: any[]
  }
  totales: {
    compras: number
    ventas: number
    inventario: number
    tesoreria: number
    notas: number
    total: number
  }
  mensaje: string
}

export async function getMovimientosSinAsiento(params: {
  company_id: number
}): Promise<MovimientosSinAsientoResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  return apiFetch(`/reportes/movimientos-sin-asiento?${queryParams.toString()}`)
}

// Nivel 3: Reportes Operativos
export interface KardexValorizadoRow {
  producto_id: number
  producto_codigo: string
  producto_nombre: string
  almacen_id: number
  almacen_codigo: string
  almacen_nombre: string
  fecha: string
  tipo: string
  cantidad: number
  costo_unitario: number
  costo_total: number
  saldo_cantidad: number
  saldo_costo_promedio: number
  saldo_valor_total: number
}

export interface KardexValorizadoResponse {
  success: boolean
  reporte: string
  datos: {
    movimientos: KardexValorizadoRow[]
    validaciones: Array<{
      producto_id: number
      almacen_id: number
      stock_fisico: number
      stock_contable: number
      diferencia: number
      cuadra: boolean
    }>
  }
  validacion: {
    valido: boolean
    errores: any[]
    mensaje: string
  }
  filtros_aplicados: any
}

export async function getKardexValorizado(params: {
  company_id: number
  product_id?: number
  almacen_id?: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<KardexValorizadoResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.product_id) queryParams.set('product_id', params.product_id.toString())
  if (params.almacen_id) queryParams.set('almacen_id', params.almacen_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/kardex?${queryParams.toString()}`)
}

export interface SaldosPorClienteRow {
  customer_id: number
  customer_nombre: string
  documento_tipo: string
  documento_id: number
  documento_serie: string
  documento_numero: string
  fecha_emision: string
  fecha_vencimiento: string | null
  monto_total: number
  saldo_pendiente: number
  antiguedad_dias: number
  antiguedad_categoria: string
}

export interface SaldosPorClienteResponse {
  success: boolean
  reporte: string
  datos: SaldosPorClienteRow[]
  totales: {
    total_clientes: number
    total_documentos: number
    total_saldo: number
  }
  filtros_aplicados: any
}

export async function getSaldosPorCliente(params: {
  company_id: number
  customer_id?: number
  fecha_corte?: string
}): Promise<SaldosPorClienteResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.customer_id) queryParams.set('customer_id', params.customer_id.toString())
  if (params.fecha_corte) queryParams.set('fecha_corte', params.fecha_corte)
  return apiFetch(`/reportes/cxc?${queryParams.toString()}`)
}

export interface SaldosPorProveedorRow {
  supplier_id: number
  supplier_nombre: string
  documento_tipo: string
  documento_id: number
  documento_serie: string
  documento_numero: string
  fecha_emision: string
  fecha_vencimiento: string | null
  monto_total: number
  saldo_pendiente: number
  antiguedad_dias: number
  antiguedad_categoria: string
}

export interface SaldosPorProveedorResponse {
  success: boolean
  reporte: string
  datos: SaldosPorProveedorRow[]
  totales: {
    total_proveedores: number
    total_documentos: number
    total_saldo: number
  }
  filtros_aplicados: any
}

export async function getSaldosPorProveedor(params: {
  company_id: number
  supplier_id?: number
  fecha_corte?: string
}): Promise<SaldosPorProveedorResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.supplier_id) queryParams.set('supplier_id', params.supplier_id.toString())
  if (params.fecha_corte) queryParams.set('fecha_corte', params.fecha_corte)
  return apiFetch(`/reportes/cxp?${queryParams.toString()}`)
}

// Nivel 5: Reportes de Auditoría
export interface TrazabilidadTotalResponse {
  success: boolean
  reporte: string
  datos: {
    asiento: {
      id: number
      fecha: string
      glosa: string
      origen: string
      status: string
    }
    documento_origen: {
      tipo: string
      id: number
      referencia: string
    } | null
    evento_contable: {
      tipo: string
      nombre: string
    } | null
    reglas_aplicadas: Array<{
      id: number
      nombre: string
      descripcion: string
    }>
    lineas: Array<{
      cuenta_codigo: string
      cuenta_nombre: string
      debe: number
      haber: number
    }>
  }
  asiento_id: number
}

export async function getTrazabilidadTotal(params: {
  company_id: number
  asiento_id: number
}): Promise<TrazabilidadTotalResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  return apiFetch(`/reportes/trazabilidad/${params.asiento_id}?${queryParams.toString()}`)
}

export interface CambiosReversionesResponse {
  success: boolean
  reporte: string
  datos: {
    asientos_revertidos: Array<{
      asiento_id: number
      fecha: string
      glosa: string
      origen: string
      fecha_reversion: string
    }>
    notas: Array<{
      nota_id: number
      tipo: string
      serie: string
      numero: string
      fecha: string
      monto: number
      documento_origen: string
    }>
    ajustes_manuales: Array<{
      asiento_id: number
      fecha: string
      glosa: string
      origen: string
    }>
    totales: {
      asientos_revertidos: number
      notas: number
      ajustes_manuales: number
    }
  }
  total_cambios: number
  mensaje: string
  filtros_aplicados: any
}

export async function getReporteCambiosReversiones(params: {
  company_id: number
  fecha_desde?: string
  fecha_hasta?: string
}): Promise<CambiosReversionesResponse> {
  const queryParams = new URLSearchParams()
  queryParams.set('company_id', params.company_id.toString())
  if (params.fecha_desde) queryParams.set('fecha_desde', params.fecha_desde)
  if (params.fecha_hasta) queryParams.set('fecha_hasta', params.fecha_hasta)
  return apiFetch(`/reportes/cambios-reversiones?${queryParams.toString()}`)
}

// ===== CASILLA ELECTRÓNICA =====
export type MailboxMessageItem = {
  id: number
  subject: string
  message_type: string
  priority: string
  requires_response: boolean
  due_date: string | null
  created_at: string
  created_by_name: string
  is_read: boolean
  read_at: string | null
  has_response: boolean
}

export type MailboxMessageDetail = MailboxMessageItem & {
  body: string
  is_acknowledged?: boolean
  acknowledged_at?: string | null
  acknowledged_by_name?: string
  attachments: Array<{ id: number; file_name: string; file_type: string }>
  responses: Array<{
    id: number
    response_text: string
    created_at: string
    created_by_name: string
    attachments: Array<{ id: number; file_name: string }>
  }>
}

export type MailboxStats = {
  unread_count: number
  pending_response_count: number
  critical_count?: number
  overdue_count?: number
}

export async function listMailboxMessages(params: {
  company_id: number
  message_type?: string
  is_read?: boolean
  limit?: number
  offset?: number
}): Promise<{ items: MailboxMessageItem[]; total: number; limit: number; offset: number }> {
  const q = new URLSearchParams()
  q.set('company_id', params.company_id.toString())
  if (params.message_type) q.set('message_type', params.message_type)
  if (params.is_read !== undefined) q.set('is_read', String(params.is_read))
  if (params.limit) q.set('limit', String(params.limit))
  if (params.offset) q.set('offset', String(params.offset))
  return apiFetch(`/mailbox/messages?${q.toString()}`)
}

export async function getMailboxMessage(messageId: number, companyId: number): Promise<MailboxMessageDetail> {
  return apiFetch(`/mailbox/messages/${messageId}?company_id=${companyId}`)
}

export async function markMailboxMessageRead(messageId: number, companyId: number): Promise<void> {
  return apiFetch(`/mailbox/messages/${messageId}/read?company_id=${companyId}`, { method: 'POST' })
}

export async function acknowledgeMailboxMessage(messageId: number, companyId: number): Promise<void> {
  return apiFetch(`/mailbox/messages/${messageId}/acknowledge?company_id=${companyId}`, { method: 'POST' })
}

export async function createMailboxResponse(messageId: number, companyId: number, responseText: string): Promise<{ id: number }> {
  return apiFetch(`/mailbox/messages/${messageId}/responses?company_id=${companyId}`, {
    method: 'POST',
    body: JSON.stringify({ response_text: responseText }),
  })
}

export async function getMailboxStats(companyId: number): Promise<MailboxStats> {
  return apiFetch(`/mailbox/stats?company_id=${companyId}`)
}

export async function downloadMailboxAttachment(attachmentId: number, companyId: number, filename: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/mailbox/attachments/${attachmentId}/download?company_id=${companyId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Error al descargar')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadMailboxResponseAttachment(attachmentId: number, companyId: number, filename: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/mailbox/response-attachments/${attachmentId}/download?company_id=${companyId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Error al descargar')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Admin: companies and send
export async function listMailboxAdminCompanies(): Promise<Array<{ id: number; name: string; ruc?: string }>> {
  return apiFetch('/mailbox/admin/companies')
}

export async function adminListAllMessages(params?: { 
  company_id?: number
  message_type?: string
  is_read?: boolean
  limit?: number
  offset?: number 
}): Promise<{ 
  items: Array<MailboxMessageItem & { company_id?: number; company_name?: string }>
  total: number 
}> {
  const q = new URLSearchParams()
  if (params?.company_id) q.set('company_id', String(params.company_id))
  if (params?.message_type) q.set('message_type', params.message_type)
  if (params?.is_read !== undefined) q.set('is_read', String(params.is_read))
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  return apiFetch(`/mailbox/admin/messages?${q.toString()}`)
}

export async function adminListCompanyMessages(companyId: number, params?: { limit?: number; offset?: number }): Promise<{ items: MailboxMessageItem[]; total: number }> {
  const q = new URLSearchParams()
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  return apiFetch(`/mailbox/admin/companies/${companyId}/messages?${q.toString()}`)
}

export async function adminGetMailboxMessage(messageId: number, companyId: number): Promise<MailboxMessageDetail> {
  return apiFetch(`/mailbox/admin/companies/${companyId}/messages/${messageId}`)
}

export async function adminCreateMailboxMessage(companyId: number, data: {
  subject: string
  body: string
  message_type: string
  priority?: string
  requires_response?: boolean
  due_date?: string | null
}): Promise<{ id: number }> {
  return apiFetch(`/mailbox/admin/companies/${companyId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      subject: data.subject,
      body: data.body,
      message_type: data.message_type,
      priority: data.priority || 'NORMAL',
      requires_response: data.requires_response || false,
      due_date: data.due_date || null,
    }),
  })
}

export async function adminUploadMessageAttachment(messageId: number, file: File): Promise<{ ok: boolean }> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/mailbox/admin/messages/${messageId}/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Error al subir adjunto')
  }
  return res.json()
}

export async function uploadMailboxResponseAttachment(responseId: number, companyId: number, file: File): Promise<{ ok: boolean }> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/mailbox/responses/${responseId}/attachments?company_id=${companyId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Error al subir adjunto')
  }
  return res.json()
}

// Empresa: enviar mensaje a SISCONT
export async function companySendToAdmin(companyId: number, data: { subject: string; body: string }): Promise<{ id: number }> {
  return apiFetch(`/mailbox/company/outgoing?company_id=${companyId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function companyUploadOutgoingAttachment(messageId: number, companyId: number, file: File): Promise<{ ok: boolean }> {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/mailbox/company/outgoing/${messageId}/attachments?company_id=${companyId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Error al subir adjunto')
  }
  return res.json()
}

export async function companyListOutgoing(companyId: number): Promise<{ items: Array<{ id: number; subject: string; created_at: string; created_by_name: string }>; total: number }> {
  return apiFetch(`/mailbox/company/outgoing?company_id=${companyId}`)
}

export async function downloadCompanyOutgoingAttachment(
  messageId: number,
  attachmentId: number,
  companyId: number,
  filename: string
): Promise<void> {
  const token = getToken()
  const res = await fetch(
    `${API_BASE}/mailbox/company/outgoing/${messageId}/attachments/${attachmentId}/download?company_id=${companyId}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  )
  if (!res.ok) throw new Error('Error al descargar')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function companyGetOutgoing(messageId: number, companyId: number): Promise<{
  id: number
  subject: string
  body: string
  company_id: number
  company_name: string
  created_at: string
  created_by_name: string
  is_read: boolean
  read_at: string | null
  attachments: Array<{ id: number; file_name: string; file_type: string }>
}> {
  return apiFetch(`/mailbox/company/outgoing/${messageId}?company_id=${companyId}`)
}

// Admin: mensajes recibidos de empresas
export async function adminListIncoming(params?: { company_id?: number; is_read?: boolean; limit?: number; offset?: number }): Promise<{
  items: Array<{ id: number; subject: string; company_id: number; company_name: string; created_at: string; created_by_name: string; is_read: boolean }>
  total: number
}> {
  const q = new URLSearchParams()
  if (params?.company_id) q.set('company_id', String(params.company_id))
  if (params?.is_read !== undefined) q.set('is_read', String(params.is_read))
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.offset) q.set('offset', String(params.offset))
  return apiFetch(`/mailbox/admin/incoming?${q.toString()}`)
}

export async function adminIncomingStats(): Promise<MailboxStats> {
  return apiFetch('/mailbox/admin/incoming/stats')
}

export async function adminGetIncoming(messageId: number): Promise<{
  id: number
  subject: string
  body: string
  company_id: number
  company_name: string
  created_at: string
  created_by_name: string
  is_read: boolean
  read_at: string | null
  attachments: Array<{ id: number; file_name: string; file_type: string }>
}> {
  return apiFetch(`/mailbox/admin/incoming/${messageId}`)
}

export async function adminMarkIncomingRead(messageId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/mailbox/admin/incoming/${messageId}/read`, { method: 'POST' })
}

export async function adminDownloadIncomingAttachment(attachmentId: number, filename: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/mailbox/admin/incoming/attachments/${attachmentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Error al descargar')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
