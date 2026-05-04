'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { FinanceTabs, type FinanceTab } from '@/components/finance/finance-tabs'
import { ExpensesTab }  from '@/components/finance/expenses/expenses-tab'
import { IncomeTab }    from '@/components/finance/income/income-tab'
import { BudgetTab }    from '@/components/finance/budget/budget-tab'
import { GoalsTab }     from '@/components/finance/goals/goals-tab'
import { TemplatesTab } from '@/components/finance/templates/templates-tab'
import { SavingsTab }   from '@/components/finance/savings/savings-tab'
import { DebtsTab }     from '@/components/finance/debts/debts-tab'
import { Spinner } from '@/components/ui/spinner'

function FinanceContent() {
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'expenses') as FinanceTab

  return (
    <div className="space-y-4 animate-fade-in">
      <FinanceTabs activeTab={tab} />
      <div className="animate-fade-in">
        {tab === 'expenses'  && <ExpensesTab />}
        {tab === 'income'    && <IncomeTab />}
        {tab === 'budget'    && <BudgetTab />}
        {tab === 'goals'     && <GoalsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'savings'   && <SavingsTab />}
        {tab === 'debts'     && <DebtsTab />}
      </div>
    </div>
  )
}

export default function FinancePage() {
  return (
    <Suspense fallback={<div className="flex justify-center pt-12"><Spinner /></div>}>
      <FinanceContent />
    </Suspense>
  )
}