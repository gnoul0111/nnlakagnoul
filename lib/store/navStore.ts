import { create } from 'zustand'

export interface NavStore {
  pendingHref: string | null
  setPending:  (href: string | null) => void
}

export const useNavStore = create<NavStore>(set => ({
  pendingHref: null,
  setPending:  href => set({ pendingHref: href }),
}))