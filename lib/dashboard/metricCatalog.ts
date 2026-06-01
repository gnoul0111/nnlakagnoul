import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, HandCoins, Target, ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react'

/**
 * Catalog chỉ số cho khu "Tổng quan".
 *
 * Tách bạch 2 tầng:
 *  - Tầng TÍNH: `MetricValues` luôn được tính đủ ở dashboard (rẻ, từ cashflow).
 *  - Tầng HIỂN THỊ: user chọn id nào hiện ra (settings.dashboardMetrics).
 *
 * Thêm chỉ số mới = thêm 1 field vào MetricValues + 1 entry vào METRIC_CATALOG.
 * Toggle hiển thị KHÔNG bao giờ ảnh hưởng cách tính.
 */

/** Các giá trị có thể hiển thị — dashboard luôn tính đủ, bất kể thẻ nào đang bật. */
export interface MetricValues {
  income:      number   // Tổng thu
  consumption: number   // Tổng chi (tiêu dùng, gồm chi tài trợ bằng nợ)
  balance:     number   // Số dư = thu − chi − chuyển dịch
  savings:     number   // Tiết kiệm đã nạp (từ kế hoạch tiết kiệm)
  debt:        number   // Trả nợ gốc trong tháng (chỉ borrow)
  goal:        number   // Nạp mục tiêu
  transfer:    number   // Tổng chuyển dịch = goal + tiết kiệm
}

export type MetricId = keyof MetricValues

export interface DashboardMetric {
  id:          MetricId
  label:       string
  icon:        LucideIcon
  color:       string   // class nền icon
  iconColor:   string   // class màu icon
  description: string    // mô tả ngắn cho panel tùy chỉnh
  default:     boolean   // có nằm trong bộ mặc định không
}

export const METRIC_CATALOG: DashboardMetric[] = [
  {
    id: 'income', label: 'Tổng thu', icon: TrendingUp,
    color: 'bg-success/10', iconColor: 'text-success',
    description: 'Tổng thu nhập trong tháng', default: true,
  },
  {
    id: 'consumption', label: 'Tổng chi', icon: TrendingDown,
    color: 'bg-destructive/10', iconColor: 'text-destructive',
    description: 'Tiêu dùng thật (gồm chi tài trợ bằng nợ, không gồm tiết kiệm/mục tiêu)', default: true,
  },
  {
    id: 'balance', label: 'Số dư', icon: Wallet,
    color: 'bg-primary/10', iconColor: 'text-primary',
    description: 'Thu − chi − chuyển dịch (tiết kiệm, mục tiêu)', default: true,
  },
  {
    id: 'savings', label: 'Tiết kiệm', icon: PiggyBank,
    color: 'bg-purple-500/10', iconColor: 'text-purple-500',
    description: 'Số tiền đã nạp vào kế hoạch tiết kiệm', default: true,
  },
  {
    id: 'debt', label: 'Trả nợ', icon: HandCoins,
    color: 'bg-orange-500/10', iconColor: 'text-orange-500',
    description: 'Tiền trả nợ gốc trong tháng (chuyển dịch, không tính vào Tổng chi)', default: false,
  },
  {
    id: 'goal', label: 'Nạp mục tiêu', icon: Target,
    color: 'bg-blue-500/10', iconColor: 'text-blue-500',
    description: 'Tiền nạp vào các mục tiêu trong tháng', default: false,
  },
  {
    id: 'transfer', label: 'Chuyển dịch', icon: ArrowLeftRight,
    color: 'bg-amber-500/10', iconColor: 'text-amber-500',
    description: 'Tổng tiền chuyển sang quỹ riêng = tiết kiệm + mục tiêu', default: false,
  },
]

const CATALOG_BY_ID: Record<MetricId, DashboardMetric> =
  Object.fromEntries(METRIC_CATALOG.map(m => [m.id, m])) as Record<MetricId, DashboardMetric>

export function getMetric(id: string): DashboardMetric | undefined {
  return CATALOG_BY_ID[id as MetricId]
}

/** Bộ thẻ mặc định (theo thứ tự catalog). Dùng khi settings chưa có dashboardMetrics. */
export const DEFAULT_DASHBOARD_METRICS: string[] =
  METRIC_CATALOG.filter(m => m.default).map(m => m.id)

/** Số thẻ tối thiểu / tối đa được phép hiển thị. */
export const MIN_DASHBOARD_METRICS = 1
export const MAX_DASHBOARD_METRICS = 6
