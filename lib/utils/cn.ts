import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes — dùng khắp nơi trong components */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
