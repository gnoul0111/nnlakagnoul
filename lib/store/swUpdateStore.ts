import { create } from 'zustand'

interface SwUpdateStore {
  hasUpdate:      boolean
  applying:       boolean  // true khi user đã bấm Cập nhật, đang chờ SW active + reload
  registration:   ServiceWorkerRegistration | null
  setHasUpdate:   (v: boolean) => void
  setApplying:    (v: boolean) => void
  setRegistration:(reg: ServiceWorkerRegistration) => void
}

export const useSwUpdateStore = create<SwUpdateStore>(set => ({
  hasUpdate:      false,
  applying:       false,
  registration:   null,
  setHasUpdate:   hasUpdate   => set({ hasUpdate }),
  setApplying:    applying    => set({ applying }),
  setRegistration: registration => set({ registration }),
}))
