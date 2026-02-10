import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Select } from '@/components/ui/Select'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Plus, Edit2, Trash2, Calendar, Lock, Unlock, CheckCircle, XCircle, RotateCcw, AlertCircle } from 'lucide-react'
import { 
	listPeriods, createPeriod, updatePeriod, deletePeriod, 
	validatePeriodClose, closePeriod, reopenPeriod,
	type Period, type PeriodCloseValidation 
} from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'

export default function Periodos(){
	const { empresaId, periodo } = useOrg()
	const { user } = useAuth()
	const [periodos, setPeriodos] = useState<Period[]>([])
	const [loading, setLoading] = useState(true)
	const [showForm, setShowForm] = useState(false)
	const [editing, setEditing] = useState<Period|null>(null)
	const [form, setForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth()+1, status: 'ABIERTO' })
	// Extraer año del período global (formato "YYYY-MM") para preseleccionar el filtro
	const yearFromPeriodo = periodo ? Number(periodo.split('-')[0]) : null
	const [filterYear, setFilterYear] = useState<number | null>(yearFromPeriodo)
	const [confirmDelete, setConfirmDelete] = useState<Period|null>(null)
	const [periodToClose, setPeriodToClose] = useState<Period|null>(null)
	const [periodToReopen, setPeriodToReopen] = useState<Period|null>(null)
	const [validation, setValidation] = useState<PeriodCloseValidation | null>(null)
	const [validating, setValidating] = useState(false)
	const [closing, setClosing] = useState(false)
	const [reopening, setReopening] = useState(false)
	const [closeReason, setCloseReason] = useState('')
	const [reopenReason, setReopenReason] = useState('')
	const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
	const canWrite = useMemo(()=> user?.role==='ADMINISTRADOR' || user?.role==='CONTADOR', [user])
	const canClose = useMemo(()=> user?.role==='ADMINISTRADOR' || user?.role==='CONTADOR', [user])
	const isAdmin = useMemo(()=> user?.role==='ADMINISTRADOR', [user])

	useEffect(()=>{ reload() }, [empresaId])
	
	// Actualizar filtro cuando cambia el período global
	useEffect(() => {
		const newYear = periodo ? Number(periodo.split('-')[0]) : null
		setFilterYear(newYear)
	}, [periodo])

	async function reload(){
		try{
			setLoading(true)
			const data = await listPeriods(empresaId)
			setPeriodos(data)
		} finally {
			setLoading(false)
		}
	}

	function openCreate(){ setEditing(null); setForm({ year: new Date().getFullYear(), month: new Date().getMonth()+1, status:'ABIERTO' }); setShowForm(true) }
	function openEdit(p:Period){ setEditing(p); setForm({ year: p.year, month: p.month, status: p.status }); setShowForm(true) }
	async function save(){
		if (!canWrite) return
		try {
			if (editing){
				await updatePeriod(editing.id, { year: form.year, month: form.month })
			}else{
				const newPeriod = await createPeriod({ empresa_id: empresaId, year: form.year, month: form.month, status: 'ABIERTO' })
				// Actualizar el período actual si es el que se creó
				const periodKey = `${form.year}-${String(form.month).padStart(2, '0')}`
				const { setPeriodo } = useOrg.getState()
				setPeriodo(periodKey)
				// Disparar evento para que AppLayout recargue períodos
				window.dispatchEvent(new CustomEvent('periodCreated', { detail: { empresaId } }))
			}
			setShowForm(false); reload()
			showMessage('success', 'Periodo Guardado', `Periodo ${editing ? 'actualizado' : 'creado'} exitosamente`)
		} catch (err: any) {
			showMessage('error', 'Error', err.message || 'Error al guardar periodo')
		}
	}
	async function doDelete(){
		if (!confirmDelete) return
		try {
			await deletePeriod(confirmDelete.id)
			setConfirmDelete(null)
			reload()
			showMessage('success', 'Periodo Eliminado', 'El periodo ha sido eliminado exitosamente')
		} catch (err: any) {
			showMessage('error', 'Error', err.message || 'Error al eliminar periodo')
		}
	}

	async function handleValidateClose(p: Period) {
		setValidating(true)
		setPeriodToClose(p)
		setValidation(null)
		try {
			const validationResult = await validatePeriodClose(p.id)
			setValidation(validationResult)
		} catch (err: any) {
			showMessage('error', 'Error de Validación', err.message || 'Error al validar el periodo')
			setPeriodToClose(null)
		} finally {
			setValidating(false)
		}
	}

	async function handleClose() {
		if (!periodToClose) return
		setClosing(true)
		try {
			await closePeriod(periodToClose.id, closeReason || undefined)
			setPeriodToClose(null)
			setValidation(null)
			setCloseReason('')
			reload()
			showMessage('success', 'Periodo Cerrado', `El periodo ${periodToClose.year}-${String(periodToClose.month).padStart(2,'0')} ha sido cerrado exitosamente`)
		} catch (err: any) {
			showMessage('error', 'Error al Cerrar', err.message || 'Error al cerrar el periodo')
		} finally {
			setClosing(false)
		}
	}

	async function handleReopen() {
		if (!periodToReopen) return
		setReopening(true)
		try {
			await reopenPeriod(periodToReopen.id, reopenReason || undefined)
			setPeriodToReopen(null)
			setReopenReason('')
			reload()
			showMessage('success', 'Periodo Reabierto', `El periodo ${periodToReopen.year}-${String(periodToReopen.month).padStart(2,'0')} ha sido reabierto exitosamente`)
		} catch (err: any) {
			showMessage('error', 'Error al Reabrir', err.message || 'Error al reabrir el periodo')
		} finally {
			setReopening(false)
		}
	}

	function showMessage(type: 'success' | 'error', title: string, message: string) {
		setMessageModal({ type, title, message })
		setTimeout(() => setMessageModal(null), 5000)
	}

	function getStatusBadge(status: string) {
		if (status === 'CERRADO') {
			return <span className="badge badge-error">🔒 CERRADO</span>
		} else if (status === 'REABIERTO') {
			return <span className="badge badge-warning">🔓 REABIERTO</span>
		} else {
			return <span className="badge badge-success">✓ ABIERTO</span>
		}
	}

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '-'
		try {
			const date = new Date(dateStr)
			return date.toLocaleString('es-PE', { 
				year: 'numeric', 
				month: '2-digit', 
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			})
		} catch {
			return dateStr
		}
	}

	const filteredPeriodos = useMemo(() => {
		if (filterYear) {
			return periodos.filter(p => p.year === filterYear)
		}
		return periodos
	}, [periodos, filterYear])

	const periodosOrdenados = useMemo(() => {
		return [...filteredPeriodos].sort((a, b) => {
			if (a.year !== b.year) return b.year - a.year
			return b.month - a.month
		})
	}, [filteredPeriodos])

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Breadcrumbs */}
			<Breadcrumbs />

			{/* Page Header */}
			<PageHeader
				title="Periodos"
				subtitle="Gestiona periodos contables de la empresa seleccionada"
				icon={Calendar}
				iconColor="primary"
				actions={
					canWrite && (
						<ActionBar
							onNew={openCreate}
							onRefresh={reload}
							loading={loading}
							newLabel="Nuevo Periodo"
						/>
					)
				}
			/>

			{/* Filter Bar */}
			<FilterBar
				searchValue=""
				onSearchChange={() => {}}
				searchPlaceholder=""
				showClearButton={false}
			>
				<Select
					value={filterYear || ''}
					onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : null)}
					options={[
						{ value: '', label: 'Todos los años' },
						...Array.from(new Set(periodos.map(p => p.year)))
							.sort((a, b) => b - a)
							.map(year => ({ value: String(year), label: String(year) }))
					]}
					fullWidth={false}
					className="min-w-[160px]"
				/>
				{filterYear && (
					<span className="text-sm text-gray-600 dark:text-gray-400 self-center">
						({filteredPeriodos.length} período{filteredPeriodos.length !== 1 ? 's' : ''})
					</span>
				)}
			</FilterBar>

			{/* Tabla */}
			<Card>
				<CardHeader 
					title={`Lista de Periodos${periodosOrdenados.length > 0 ? ` (${periodosOrdenados.length} período${periodosOrdenados.length !== 1 ? 's' : ''})` : ''}`}
					icon={<Calendar className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
				/>
				<DataTable
					data={periodosOrdenados}
					loading={loading}
					emptyMessage="No hay períodos registrados. Crea uno nuevo para comenzar."
					pageSize={12}
					columns={[
								{
									key: 'periodo',
									label: 'Año',
									render: (p) => (
										<div className="flex items-center gap-3">
											<div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
												<span className="text-gray-700 dark:text-gray-300 font-semibold text-sm">{p.year}</span>
											</div>
											<div>
												<div className="font-bold text-base text-gray-900 dark:text-gray-100">
													{p.year}-{String(p.month).padStart(2, '0')}
												</div>
												<div className="text-xs text-gray-500 dark:text-gray-400">
													{new Date(p.year, p.month - 1, 1).toLocaleString('es-PE', { month: 'long', year: 'numeric' })}
												</div>
											</div>
										</div>
									),
								},
								{
									key: 'estado',
									label: 'Estado',
									render: (p) => (
										<div>
											{getStatusBadge(p.status)}
											{p.status === 'CERRADO' && p.closed_at && (
												<div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
													Cerrado: {formatDate(p.closed_at)}
												</div>
											)}
											{p.status === 'REABIERTO' && p.reopened_at && (
												<div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
													Reabierto: {formatDate(p.reopened_at)}
												</div>
											)}
										</div>
									),
								},
								{
									key: 'info',
									label: 'Información de Cierre',
									render: (p) =>
										p.status === 'CERRADO' && p.closed_at ? (
											<div className="text-sm">
												<div className="font-medium text-gray-900 dark:text-gray-100">Cerrado el:</div>
												<div className="text-gray-600 dark:text-gray-400">{formatDate(p.closed_at)}</div>
												{p.close_reason && (
													<div className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">
														Motivo: {p.close_reason}
													</div>
												)}
											</div>
										) : p.status === 'REABIERTO' && p.reopened_at ? (
											<div className="text-sm">
												<div className="font-medium text-gray-900 dark:text-gray-100">Reabierto el:</div>
												<div className="text-gray-600 dark:text-gray-400">{formatDate(p.reopened_at)}</div>
												{p.reopen_reason && (
													<div className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">
														Motivo: {p.reopen_reason}
													</div>
												)}
											</div>
										) : (
											<span className="text-gray-400 dark:text-gray-500">-</span>
										),
								},
								{
									key: 'acciones',
									label: 'Acciones',
									render: (p) => (
										<div className="flex items-center justify-end gap-2">
											{canWrite && p.status !== 'CERRADO' && (
												<Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Editar" className="hover:bg-blue-50 dark:hover:bg-blue-900/20">
													<Edit2 className="w-4 h-4" />
												</Button>
											)}
											{canClose && (p.status === 'ABIERTO' || p.status === 'REABIERTO') && (
												<Button
													variant="ghost"
													size="sm"
													className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
													onClick={() => handleValidateClose(p)}
													title="Cerrar período"
													disabled={validating}
												>
													<Lock className="w-4 h-4" />
												</Button>
											)}
											{isAdmin && p.status === 'CERRADO' && (
												<Button
													variant="ghost"
													size="sm"
													className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
													onClick={() => setPeriodToReopen(p)}
													title="Reabrir período"
												>
													<Unlock className="w-4 h-4" />
												</Button>
											)}
											{isAdmin && (
												<Button
													variant="ghost"
													size="sm"
													className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
													onClick={() => setConfirmDelete(p)}
													title="Eliminar período"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											)}
										</div>
									),
									className: 'text-right',
								},
							]}
						/>
					</Card>

			{confirmDelete && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
						<div className="text-lg font-bold mb-2">Eliminar Periodo</div>
						<div className="text-sm text-gray-700">
							Esta acción es <span className="font-semibold text-red-600">irreversible</span>. ¿Eliminar el periodo "{confirmDelete.year}-{String(confirmDelete.month).padStart(2,'0')}" (ID {confirmDelete.id})?
						</div>
						<div className="mt-6 flex justify-end gap-2">
							<Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
							<Button className="bg-red-600 hover:bg-red-700" onClick={doDelete}>Eliminar</Button>
						</div>
					</div>
				</div>
			)}

			{showForm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<div className="absolute inset-0 bg-black/30" onClick={()=> setShowForm(false)} />
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
						<div className="text-lg font-bold mb-4">{editing ? 'Editar Periodo' : 'Nuevo Periodo'}</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="text-sm text-gray-600">Año</label>
								<input type="number" value={form.year} onChange={e=>setForm(f=>({...f, year:Number(e.target.value)}))} className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2" />
							</div>
							<div>
								<label className="text-sm text-gray-600">Mes</label>
								<input type="number" min={1} max={12} value={form.month} onChange={e=>setForm(f=>({...f, month:Number(e.target.value)}))} className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2" />
							</div>
							<div className="md:col-span-2">
								<p className="text-xs text-gray-500">
									Nota: Los nuevos períodos se crean con estado ABIERTO. El cierre debe realizarse desde el botón "Cerrar Período" después de validar los datos.
								</p>
							</div>
						</div>
						<div className="mt-6 flex justify-end gap-2">
							<Button variant="outline" onClick={()=> setShowForm(false)}>Cancelar</Button>
							{canWrite && <Button onClick={save}>Guardar</Button>}
						</div>
					</div>
				</div>
			)}

			{/* Modal de Validación y Cierre */}
			{periodToClose && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setPeriodToClose(null); setValidation(null); setCloseReason('') }}></div>
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
						<div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-6 rounded-t-2xl sticky top-0 z-10">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Lock className="w-6 h-6" />
									<div>
										<h2 className="text-xl font-bold">Cerrar Período</h2>
										<p className="text-sm text-orange-100">Período: {periodToClose.year}-{String(periodToClose.month).padStart(2,'0')}</p>
									</div>
								</div>
								<button onClick={() => { setPeriodToClose(null); setValidation(null); setCloseReason('') }} className="text-white hover:text-gray-200">
									<XCircle className="w-6 h-6" />
								</button>
							</div>
						</div>

						<div className="p-6 space-y-6">
							{!validation && validating && (
								<div className="text-center py-8">
									<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
									<p className="text-gray-600">Validando período...</p>
								</div>
							)}

							{validation && (
								<>
									{validation.valid ? (
										<div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
											<div className="flex items-center gap-2 text-green-800">
												<CheckCircle className="w-5 h-5" />
												<span className="font-semibold">✓ Período válido para cerrar</span>
											</div>
											<div className="mt-3 text-sm text-green-700">
												<p>• {validation.entry_count} asientos contables encontrados</p>
												{validation.warnings.length > 0 && (
													<div className="mt-2">
														<p className="font-semibold">Advertencias:</p>
														<ul className="list-disc list-inside">
															{validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
														</ul>
													</div>
												)}
											</div>
										</div>
									) : (
										<div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
											<div className="flex items-center gap-2 text-red-800 mb-3">
												<AlertCircle className="w-5 h-5" />
												<span className="font-semibold">✗ No se puede cerrar el período</span>
											</div>
											<div className="text-sm text-red-700 space-y-2">
												{validation.errors.map((error, i) => (
													<div key={i}>• {error}</div>
												))}
											</div>
											{validation.unbalanced_entries.length > 0 && (
												<div className="mt-4">
													<p className="font-semibold text-red-800 mb-2">Asientos desbalanceados:</p>
													<div className="max-h-40 overflow-y-auto">
														{validation.unbalanced_entries.map((e, i) => (
															<div key={i} className="text-xs bg-red-100 p-2 rounded mb-1">
																ID {e.entry_id}: Diferencia S/ {e.difference.toFixed(2)}
															</div>
														))}
													</div>
												</div>
											)}
										</div>
									)}

									{validation.valid && (
										<>
											<div>
												<label className="text-sm font-semibold text-gray-700 mb-2 block">Motivo/Justificación (Opcional)</label>
												<textarea
													value={closeReason}
													onChange={e => setCloseReason(e.target.value)}
													placeholder="Ej: Cierre mensual normal, todos los asientos validados..."
													className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm"
													rows={3}
												/>
											</div>

											<div className="flex justify-end gap-2">
												<Button variant="outline" onClick={() => { setPeriodToClose(null); setValidation(null); setCloseReason('') }}>
													Cancelar
												</Button>
												<Button 
													onClick={handleClose} 
													disabled={closing}
													className="bg-orange-600 hover:bg-orange-700"
												>
													{closing ? 'Cerrando...' : 'Confirmar Cierre'}
												</Button>
											</div>
										</>
									)}

									{!validation.valid && (
										<div className="flex justify-end">
											<Button variant="outline" onClick={() => { setPeriodToClose(null); setValidation(null); setCloseReason('') }}>
												Cerrar
											</Button>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Modal de Reapertura */}
			{periodToReopen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setPeriodToReopen(null); setReopenReason('') }}></div>
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
						<div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-6 rounded-t-2xl mb-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Unlock className="w-6 h-6" />
									<div>
										<h2 className="text-xl font-bold">Reabrir Período</h2>
										<p className="text-sm text-green-100">Período: {periodToReopen.year}-{String(periodToReopen.month).padStart(2,'0')}</p>
									</div>
								</div>
								<button onClick={() => { setPeriodToReopen(null); setReopenReason('') }} className="text-white hover:text-gray-200">
									<XCircle className="w-6 h-6" />
								</button>
							</div>
						</div>

						<div className="space-y-4">
							<div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
								<p className="text-sm text-yellow-800">
									⚠️ <strong>Advertencia:</strong> Al reabrir un período cerrado, se permitirá nuevamente la creación y modificación de asientos contables. 
									Esta acción debe usarse solo cuando sea absolutamente necesario.
								</p>
							</div>

							<div>
								<label className="text-sm font-semibold text-gray-700 mb-2 block">Motivo/Justificación (Opcional pero recomendado)</label>
								<textarea
									value={reopenReason}
									onChange={e => setReopenReason(e.target.value)}
									placeholder="Ej: Corrección de asientos incorrectos, ajuste contable necesario..."
									className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm"
									rows={3}
								/>
							</div>

							<div className="flex justify-end gap-2">
								<Button variant="outline" onClick={() => { setPeriodToReopen(null); setReopenReason('') }}>
									Cancelar
								</Button>
								<Button 
									onClick={handleReopen} 
									disabled={reopening}
									className="bg-green-600 hover:bg-green-700"
								>
									{reopening ? 'Reabriendo...' : 'Confirmar Reapertura'}
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Modal de Mensaje */}
			{messageModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMessageModal(null)}></div>
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
						<div className={`flex items-center gap-3 mb-4 ${messageModal.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
							{messageModal.type === 'success' ? (
								<CheckCircle className="w-6 h-6" />
							) : (
								<XCircle className="w-6 h-6" />
							)}
							<h3 className="text-lg font-bold">{messageModal.title}</h3>
						</div>
						<div className="text-gray-700 mb-6 whitespace-pre-line">{messageModal.message}</div>
						<div className="flex justify-end">
							<Button onClick={() => setMessageModal(null)}>Aceptar</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
