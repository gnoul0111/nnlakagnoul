import type { CategoryValue } from './expense'

export interface Template {
  id: string
  userId: string
  title: string
  category: CategoryValue
  amount: number
  note: string
  deleted?: boolean
}
