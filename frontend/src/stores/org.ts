import { create } from 'zustand'
type OrgState = { empresaId: number; periodo: string; setEmpresa: (id:number)=>void; setPeriodo: (p:string)=>void; }
function nowPeriod(){ return new Date().toISOString().slice(0,7) }
function getStoredEmpresa(){ return Number(localStorage.getItem('empresaId')||1) }
function getStoredPeriodoFor(empresaId:number){ return localStorage.getItem(`periodo:${empresaId}`) || nowPeriod() }

export const useOrg = create<OrgState>((set, get)=> ({
  empresaId: getStoredEmpresa(),
  periodo: getStoredPeriodoFor(getStoredEmpresa()),
  setEmpresa: (id)=>{ 
    localStorage.setItem('empresaId', String(id)); 
    const per = getStoredPeriodoFor(id)
    set({empresaId:id, periodo: per}); 
  },
  setPeriodo: (p)=>{ 
    const id = get().empresaId
    localStorage.setItem(`periodo:${id}`, p); 
    set({periodo:p}); 
  },
}))
