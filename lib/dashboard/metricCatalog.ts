import { PiggyBank, HandCoins, Target, type LucideIcon } from 'lucide-react'

/**
 * Chỉ số cho khu "Tổng quan" (layout Concept A — hero + chip phụ).
 *
 * Tách 2 vai:
 *  - CHÍNH (hero): Thu / Chi / Số dư — LUÔN hiển thị, không tắt được.
 *  - PHỤ (chip): savings / debt / goal — bật/tắt qua panel tùy chỉnh.
 *
 * Tầng tính (`MetricValues`) luôn được tính đủ ở dashboard; toggle chỉ ảnh hưởng
 * chip nào hiện, KHÔNG ảnh hưởng cách tính.
 */

/** Mọi giá trị dashboard cần — luôn tính đủ. */
export interface MetricValues {
  income:      number   // Tổng thu
  consumption: number   // Tổng chi (tiêu dùng, gồm chi tài trợ bằng nợ)
  balance:     number   // Số dư = thu − chi − trả nợ − chuyển dịch
  savings:     number   // Tiết kiệm đã nạp
  debt:        number   // Trả nợ gốc trong tháng (chỉ borrow)
  goal:        number   // Nạp mục tiêu
}

/** Id các chỉ số phụ (chip bật/tắt được). */
export type SecondaryMetricId = 'savings' | 'debt' | 'goal'

export interface SecondaryMetric {
  id:          SecondaryMetricId
  label:       string
  icon:        LucideIcon
  color:       string   // class nền icon (tròn)
  iconColor:   string   // class màu icon
  barColor:    string   // class nền thanh tiến độ
  href:        string   // điều hướng khi bấm thẻ
  targetLabel: string   // nhãn dòng phụ ("Mục tiêu" / "Tổng nợ")
  description: string   // mô tả cho panel tùy chỉnh
  default:     boolean
}

export const SECONDARY_METRICS: SecondaryMetric[] = [
  {
    id: 'savings', label: 'Tiết kiệm', icon: PiggyBank,
    color: 'bg-purple-500/10', iconColor: 'text-purple-500', barColor: 'bg-purple-500',
    href: '/finance', targetLabel: 'Mục tiêu',
    description: 'Số tiền đã nạp vào kế hoạch tiết kiệm', default: true,
  },
  {
    id: 'debt', label: 'Trả nợ', icon: HandCoins,
    color: 'bg-orange-500/10', iconColor: 'text-orange-500', barColor: 'bg-orange-500',
    href: '/finance', targetLabel: 'Còn nợ',
    description: 'Tiền trả nợ gốc trong tháng (không tính vào Tổng chi)', default: true,
  },
  {
    id: 'goal', label: 'Nạp mục tiêu', icon: Target,
    color: 'bg-blue-500/10', iconColor: 'text-blue-500', barColor: 'bg-blue-500',
    href: '/finance', targetLabel: 'Mục tiêu',
    description: 'Tiền nạp vào các mục tiêu trong tháng', default: true,
  },
]

