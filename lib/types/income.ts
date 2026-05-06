export interface Income {
  id: string
  userId: string
  amount: number
  source: string      // Nguồn thu (text tự do, vd: "Lương", "Freelance")
  date: string        // YYYY-MM-DD
  month: string       // YYYY-MM — dùng để filter nhanh
  note: string

  deleted?: boolean
  deletedAt?: string
  _deletedClientTimestamp?: string
}