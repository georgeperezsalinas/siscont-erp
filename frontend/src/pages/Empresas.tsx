import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Select } from '@/components/ui/Select'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Plus, Building2, Edit2, Trash2, Settings, Download, Search } from 'lucide-react'
import { listCompanies, createCompany, updateCompany, activateCompany, deactivateCompany, deleteCompany, exportCompaniesCsv, exportCompaniesExcel, type Company } from '@/api'
import { showToast } from '@/components/ui/Toast'

export default function Empresas() {
  const [empresas, setEmpresas] = useState<Company[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)
  const [orderBy, setOrderBy] = useState('id')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    ruc: '',
    commercial_name: '',
    taxpayer_type: '',
    fiscal_address: '',
    ubigeo: '',
    phone: '',
    email: '',
    tax_regime: '',
    economic_activity_code: '',
    sunat_status: '',
    domicile_condition: '',
    legal_representative_name: '',
    legal_representative_dni: '',
    legal_representative_position: ''
  })
  const [editing, setEditing] = useState<Company | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Company | null>(null)
  const rucError = useMemo(() => {
    if (!form.ruc) return ''
    if (!/^\d{11}$/.test(form.ruc)) return 'RUC debe tener 11 dígitos numéricos'
    // SUNAT checksum: última cifra = verificador
    const digits = form.ruc.split('').map(Number)
    const weights = [5,4,3,2,7,6,5,4,3,2] // para 11 dígitos aplica a los primeros 10
    let sum = 0
    for (let i=0;i<10;i++){ sum += digits[i]*weights[i] }
    const mod = sum % 11
    const check = (11 - mod) % 10
    return check === digits[10] ? '' : 'RUC inválido (checksum)'
  }, [form.ruc])

  useEffect(() => { reload() }, [q, activeFilter, orderBy, page, pageSize])

  async function reload(){
    try{ 
      setLoading(true); 
      const data = await listCompanies({ q, active: activeFilter, order_by: orderBy, page, page_size: pageSize }); 
      setEmpresas(data.items); setTotal(data.total)
    } finally { setLoading(false) }
  }

  async function onCreate(){
    if (!form.name.trim()) {
      showToast('error', 'La razón social es obligatoria', 'Error de validación')
      return
    }
    if (rucError) {
      showToast('error', rucError, 'Error de validación')
      return
    }
    try {
      const created = await createCompany({
        name: form.name.trim(),
        ruc: form.ruc.trim() || null,
        commercial_name: form.commercial_name.trim() || null,
        taxpayer_type: form.taxpayer_type.trim() || null,
        fiscal_address: form.fiscal_address.trim() || null,
        ubigeo: form.ubigeo.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tax_regime: form.tax_regime.trim() || null,
        economic_activity_code: form.economic_activity_code.trim() || null,
        sunat_status: form.sunat_status.trim() || null,
        domicile_condition: form.domicile_condition.trim() || null,
        legal_representative_name: form.legal_representative_name.trim() || null,
        legal_representative_dni: form.legal_representative_dni.trim() || null,
        legal_representative_position: form.legal_representative_position.trim() || null
      })
      window.dispatchEvent(new CustomEvent('companyCreated', { detail: { company: created } }))
      showToast('success', `Empresa "${form.name.trim()}" creada correctamente`, 'Éxito')
      setForm({
        name: '',
        ruc: '',
        commercial_name: '',
        taxpayer_type: '',
        fiscal_address: '',
        ubigeo: '',
        phone: '',
        email: '',
        tax_regime: '',
        economic_activity_code: '',
        sunat_status: '',
        domicile_condition: '',
        legal_representative_name: '',
        legal_representative_dni: '',
        legal_representative_position: ''
      })
      setShowForm(false)
      reload()
    } catch (err: any) {
      console.error('Error creando empresa:', err)
      showToast('error', err.message || 'Error al crear la empresa', 'Error')
    }
  }

  async function onToggle(e: Company){
    try {
      if (e.active) {
        await deactivateCompany(e.id)
        showToast('success', `Empresa "${e.name}" desactivada`, 'Éxito')
      } else {
        await activateCompany(e.id)
        showToast('success', `Empresa "${e.name}" activada`, 'Éxito')
      }
      window.dispatchEvent(new CustomEvent('companyCreated', { detail: { company: { ...e, active: !e.active } } }))
      reload()
    } catch (err: any) {
      console.error('Error cambiando estado:', err)
      showToast('error', err.message || 'Error al cambiar el estado de la empresa', 'Error')
    }
  }

  function openEdit(e: Company){
    setEditing(e)
    setForm({
      name: e.name,
      ruc: e.ruc || '',
      commercial_name: e.commercial_name || '',
      taxpayer_type: e.taxpayer_type || '',
      fiscal_address: e.fiscal_address || '',
      ubigeo: e.ubigeo || '',
      phone: e.phone || '',
      email: e.email || '',
      tax_regime: e.tax_regime || '',
      economic_activity_code: e.economic_activity_code || '',
      sunat_status: e.sunat_status || '',
      domicile_condition: e.domicile_condition || '',
      legal_representative_name: e.legal_representative_name || '',
      legal_representative_dni: e.legal_representative_dni || '',
      legal_representative_position: e.legal_representative_position || ''
    })
  }
  async function saveEdit(){
    if (!editing) return
    if (!form.name.trim()) {
      showToast('error', 'La razón social es obligatoria', 'Error de validación')
      return
    }
    if (rucError) {
      showToast('error', rucError, 'Error de validación')
      return
    }
    try {
      const updated = await updateCompany(editing.id, {
        name: form.name.trim(),
        ruc: form.ruc.trim() || null,
        commercial_name: form.commercial_name.trim() || null,
        taxpayer_type: form.taxpayer_type.trim() || null,
        fiscal_address: form.fiscal_address.trim() || null,
        ubigeo: form.ubigeo.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tax_regime: form.tax_regime.trim() || null,
        economic_activity_code: form.economic_activity_code.trim() || null,
        sunat_status: form.sunat_status.trim() || null,
        domicile_condition: form.domicile_condition.trim() || null,
        legal_representative_name: form.legal_representative_name.trim() || null,
        legal_representative_dni: form.legal_representative_dni.trim() || null,
        legal_representative_position: form.legal_representative_position.trim() || null
      })
      window.dispatchEvent(new CustomEvent('companyCreated', { detail: { company: updated } }))
      showToast('success', `Empresa "${form.name.trim()}" actualizada correctamente`, 'Éxito')
      setEditing(null)
      setForm({
        name: '',
        ruc: '',
        commercial_name: '',
        taxpayer_type: '',
        fiscal_address: '',
        ubigeo: '',
        phone: '',
        email: '',
        tax_regime: '',
        economic_activity_code: '',
        sunat_status: '',
        domicile_condition: '',
        legal_representative_name: '',
        legal_representative_dni: '',
        legal_representative_position: ''
      })
      reload()
    } catch (err: any) {
      console.error('Error actualizando empresa:', err)
      showToast('error', err.message || 'Error al actualizar la empresa', 'Error')
    }
  }

  function openDelete(e: Company){ setConfirmDelete(e) }
  async function doDelete(){
    if (!confirmDelete) return
    try {
      await deleteCompany(confirmDelete.id)
      showToast('success', `Empresa "${confirmDelete.name}" eliminada correctamente`, 'Éxito')
      setConfirmDelete(null)
      reload()
    } catch (err: any) {
      console.error('Error eliminando empresa:', err)
      showToast('error', err.message || 'Error al eliminar la empresa', 'Error')
    }
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Empresas"
        subtitle="Gestiona tus empresas y datos empresariales"
        icon={Building2}
        iconColor="primary"
        actions={
          <ActionBar
            onNew={() => setShowForm(true)}
            onRefresh={reload}
            onExportCsv={async () => {
              try {
                const blob = await exportCompaniesCsv({ q, active: activeFilter })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'empresas.csv'
                a.click()
                URL.revokeObjectURL(url)
                showToast('success', 'Archivo CSV exportado correctamente', 'Éxito')
              } catch (err: any) {
                console.error('Error exportando CSV:', err)
                showToast('error', err.message || 'Error al exportar CSV', 'Error')
              }
            }}
            onExportExcel={async () => {
              try {
                const blob = await exportCompaniesExcel({ q, active: activeFilter })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'empresas.xlsx'
                a.click()
                URL.revokeObjectURL(url)
                showToast('success', 'Archivo Excel exportado correctamente', 'Éxito')
              } catch (err: any) {
                console.error('Error exportando Excel:', err)
                showToast('error', err.message || 'Error al exportar Excel', 'Error')
              }
            }}
            loading={loading}
            newLabel="Nueva Empresa"
          />
        }
      />

      {/* Filter Bar */}
      <FilterBar
        searchValue={q}
        onSearchChange={(value) => { setPage(1); setQ(value) }}
        searchPlaceholder="Buscar por razón social o RUC..."
      >
        <Select
          value={activeFilter === undefined ? 'all' : activeFilter ? 'true' : 'false'}
          onChange={(e) => { setPage(1); setActiveFilter(e.target.value === 'all' ? undefined : e.target.value === 'true') }}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'true', label: 'Activas' },
            { value: 'false', label: 'Inactivas' },
          ]}
          fullWidth={false}
          className="min-w-[140px]"
        />
        <Select
          value={orderBy}
          onChange={(e) => { setPage(1); setOrderBy(e.target.value) }}
          options={[
            { value: 'id', label: 'Orden: ID' },
            { value: 'name', label: 'Orden: Nombre' },
            { value: 'ruc', label: 'Orden: RUC' },
          ]}
          fullWidth={false}
          className="min-w-[160px]"
        />
      </FilterBar>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={()=>{ setShowForm(false); setForm({name:'', ruc:'', commercial_name:'', taxpayer_type:'', fiscal_address:'', ubigeo:'', phone:'', email:'', tax_regime:'', economic_activity_code:'', sunat_status:'', domicile_condition:'', legal_representative_name:'', legal_representative_dni:'', legal_representative_position:''}) }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Nueva Empresa</div>
            
            {/* Datos Básicos */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Datos Básicos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Razón Social / Denominación <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} placeholder="INDUSTRIAS ANDES S.A.C." className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">RUC (11 dígitos) <span className="text-red-500">*</span></label>
                  <input value={form.ruc} onChange={e=>setForm(f=>({...f, ruc:e.target.value}))} placeholder="20123456789" maxLength={11} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  {rucError && <div className="text-xs text-red-600 mt-1">{rucError}</div>}
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Nombre Comercial</label>
                  <input value={form.commercial_name} onChange={e=>setForm(f=>({...f, commercial_name:e.target.value}))} placeholder="Textiles Los Andes" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Tipo de Contribuyente</label>
                  <select value={form.taxpayer_type} onChange={e=>setForm(f=>({...f, taxpayer_type:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Natural con negocio">Natural con negocio</option>
                    <option value="Jurídica">Jurídica</option>
                    <option value="EIRL">EIRL</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Datos SUNAT / PLE */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Datos SUNAT / PLE</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Domicilio Fiscal</label>
                  <input value={form.fiscal_address} onChange={e=>setForm(f=>({...f, fiscal_address:e.target.value}))} placeholder="Av. Arequipa 2345, Lima" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Ubigeo SUNAT (6 dígitos)</label>
                  <input value={form.ubigeo} onChange={e=>setForm(f=>({...f, ubigeo:e.target.value}))} placeholder="150101" maxLength={6} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Teléfono</label>
                  <input value={form.phone} onChange={e=>setForm(f=>({...f, phone:e.target.value}))} placeholder="(01) 4567890" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Correo electrónico</label>
                  <input type="email" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} placeholder="contacto@andes.pe" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Régimen Tributario</label>
                  <select value={form.tax_regime} onChange={e=>setForm(f=>({...f, tax_regime:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Régimen General">Régimen General</option>
                    <option value="RMT">RMT</option>
                    <option value="MYPE">MYPE</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Actividad Económica (CIIU)</label>
                  <input value={form.economic_activity_code} onChange={e=>setForm(f=>({...f, economic_activity_code:e.target.value}))} placeholder="1410" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Estado SUNAT</label>
                  <select value={form.sunat_status} onChange={e=>setForm(f=>({...f, sunat_status:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Activo">Activo</option>
                    <option value="Baja definitiva">Baja definitiva</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Condición Domicilio SUNAT</label>
                  <select value={form.domicile_condition} onChange={e=>setForm(f=>({...f, domicile_condition:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Habido">Habido</option>
                    <option value="No habido">No habido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Representante Legal */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Representante Legal (Opcional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Nombres</label>
                  <input value={form.legal_representative_name} onChange={e=>setForm(f=>({...f, legal_representative_name:e.target.value}))} placeholder="Juan Pérez" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">DNI</label>
                  <input value={form.legal_representative_dni} onChange={e=>setForm(f=>({...f, legal_representative_dni:e.target.value}))} placeholder="12345678" maxLength={8} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Cargo</label>
                  <input value={form.legal_representative_position} onChange={e=>setForm(f=>({...f, legal_representative_position:e.target.value}))} placeholder="Gerente" className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{ setShowForm(false); setForm({name:'', ruc:'', commercial_name:'', taxpayer_type:'', fiscal_address:'', ubigeo:'', phone:'', email:'', tax_regime:'', economic_activity_code:'', sunat_status:'', domicile_condition:'', legal_representative_name:'', legal_representative_dni:'', legal_representative_position:''}) }}>Cancelar</Button>
              <Button onClick={onCreate}>Guardar</Button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={()=>{ setEditing(null); setForm({name:'', ruc:'', commercial_name:'', taxpayer_type:'', fiscal_address:'', ubigeo:'', phone:'', email:'', tax_regime:'', economic_activity_code:'', sunat_status:'', domicile_condition:'', legal_representative_name:'', legal_representative_dni:'', legal_representative_position:''}) }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Editar Empresa</div>
            
            {/* Datos Básicos */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Datos Básicos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Razón Social / Denominación <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">RUC (11 dígitos) <span className="text-red-500">*</span></label>
                  <input value={form.ruc} onChange={e=>setForm(f=>({...f, ruc:e.target.value}))} maxLength={11} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  {rucError && <div className="text-xs text-red-600 mt-1">{rucError}</div>}
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Nombre Comercial</label>
                  <input value={form.commercial_name} onChange={e=>setForm(f=>({...f, commercial_name:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Tipo de Contribuyente</label>
                  <select value={form.taxpayer_type} onChange={e=>setForm(f=>({...f, taxpayer_type:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Natural con negocio">Natural con negocio</option>
                    <option value="Jurídica">Jurídica</option>
                    <option value="EIRL">EIRL</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Datos SUNAT / PLE */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Datos SUNAT / PLE</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Domicilio Fiscal</label>
                  <input value={form.fiscal_address} onChange={e=>setForm(f=>({...f, fiscal_address:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Ubigeo SUNAT (6 dígitos)</label>
                  <input value={form.ubigeo} onChange={e=>setForm(f=>({...f, ubigeo:e.target.value}))} maxLength={6} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Teléfono</label>
                  <input value={form.phone} onChange={e=>setForm(f=>({...f, phone:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Correo electrónico</label>
                  <input type="email" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Régimen Tributario</label>
                  <select value={form.tax_regime} onChange={e=>setForm(f=>({...f, tax_regime:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Régimen General">Régimen General</option>
                    <option value="RMT">RMT</option>
                    <option value="MYPE">MYPE</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Actividad Económica (CIIU)</label>
                  <input value={form.economic_activity_code} onChange={e=>setForm(f=>({...f, economic_activity_code:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Estado SUNAT</label>
                  <select value={form.sunat_status} onChange={e=>setForm(f=>({...f, sunat_status:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Activo">Activo</option>
                    <option value="Baja definitiva">Baja definitiva</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Condición Domicilio SUNAT</label>
                  <select value={form.domicile_condition} onChange={e=>setForm(f=>({...f, domicile_condition:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option value="">Seleccionar...</option>
                    <option value="Habido">Habido</option>
                    <option value="No habido">No habido</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Representante Legal */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Representante Legal (Opcional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Nombres</label>
                  <input value={form.legal_representative_name} onChange={e=>setForm(f=>({...f, legal_representative_name:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">DNI</label>
                  <input value={form.legal_representative_dni} onChange={e=>setForm(f=>({...f, legal_representative_dni:e.target.value}))} maxLength={8} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Cargo</label>
                  <input value={form.legal_representative_position} onChange={e=>setForm(f=>({...f, legal_representative_position:e.target.value}))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{ setEditing(null); setForm({name:'', ruc:'', commercial_name:'', taxpayer_type:'', fiscal_address:'', ubigeo:'', phone:'', email:'', tax_regime:'', economic_activity_code:'', sunat_status:'', domicile_condition:'', legal_representative_name:'', legal_representative_dni:'', legal_representative_position:''}) }}>Cancelar</Button>
              <Button onClick={saveEdit}>Guardar cambios</Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setConfirmDelete(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Eliminar Empresa</div>
            <div className="text-sm text-gray-700 dark:text-gray-300">Esta acción es <span className="font-semibold text-red-600 dark:text-red-400">irreversible</span>. ¿Eliminar "{confirmDelete.name}" (ID {confirmDelete.id})?</div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setConfirmDelete(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDelete}>Eliminar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de Empresas */}
      <Card>
        <CardHeader 
          title={`Lista de Empresas${total > 0 ? ` (${total} empresa${total !== 1 ? 's' : ''})` : ''}`}
          icon={<Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <DataTable
          data={empresas}
          loading={loading}
          emptyMessage="No hay empresas registradas."
          pageSize={pageSize}
          columns={[
            {
              key: 'id',
              label: 'ID',
              render: (e) => (
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">#{e.id}</span>
              ),
              className: 'w-20',
            },
            {
              key: 'name',
              label: 'Razón Social',
              render: (e) => (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{e.name}</span>
                </div>
              ),
            },
            {
              key: 'ruc',
              label: 'RUC',
              render: (e) => (
                e.ruc ? (
                  <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{e.ruc}</span>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                )
              ),
            },
            {
              key: 'active',
              label: 'Estado',
              render: (e) => (
                <span className={`badge ${e.active ? 'badge-success' : 'badge-error'}`}>
                  {e.active ? 'Activa' : 'Inactiva'}
                </span>
              ),
            },
            {
              key: 'acciones',
              label: 'Acciones',
              render: (e) => (
                <div className="flex items-center justify-end gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onToggle(e)
                    }} 
                    className="hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    title={e.active ? 'Desactivar empresa' : 'Activar empresa'}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(ev) => {
                      ev.stopPropagation()
                      openEdit(e)
                    }} 
                    className="hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    title="Editar empresa"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" 
                    onClick={(ev) => {
                      ev.stopPropagation()
                      openDelete(e)
                    }}
                    title="Eliminar empresa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ),
              className: 'text-right',
              sortable: false,
            },
          ]}
        />
      </Card>

      {/* Paginación manual si hay más resultados */}
      {!loading && total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Mostrando {(page-1)*pageSize+1} a {Math.min(page*pageSize, total)} de {total} empresas
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={()=> setPage(p=>Math.max(1, p-1))} 
              disabled={page<=1}
            >
              Anterior
            </Button>
            <span className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Página {page} de {Math.ceil(total/pageSize)}
            </span>
            <Button 
              variant="outline" 
              onClick={()=> setPage(p=> (p*pageSize<total ? p+1 : p))} 
              disabled={page*pageSize>=total}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-blue-900 mb-1">Multiempresa</div>
            <p className="text-sm text-blue-700">
              Puedes gestionar múltiples empresas desde una sola cuenta. 
              Cada empresa tiene su propia configuración contable y períodos fiscales.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
