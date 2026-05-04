'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { SettingsTabs, type SettingsTabId } from '@/components/settings/settings-tabs'
import { ProfileTab }     from '@/components/settings/profile-tab'
import { PreferencesTab } from '@/components/settings/preferences-tab'
import { DataTab }        from '@/components/settings/data-tab'

function SettingsContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const tab = (searchParams.get('tab') ?? 'profile') as SettingsTabId

  const handleTabChange = (t: SettingsTabId) => {
    router.replace(t === 'profile' ? '/settings' : `/settings?tab=${t}`)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SettingsTabs active={tab} onChange={handleTabChange} />
      <div className="flex-1 overflow-y-auto">
        {tab === 'profile'     && <ProfileTab />}
        {tab === 'preferences' && <PreferencesTab />}
        {tab === 'data'        && <DataTab />}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    // Suspense cần thiết vì useSearchParams() yêu cầu CSR boundary
    <Suspense fallback={<div className="flex-1" />}>
      <SettingsContent />
    </Suspense>
  )
}
