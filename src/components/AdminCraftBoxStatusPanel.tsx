'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Boxes } from 'lucide-react'
import type { CraftQueueItem, CraftBoxConfig } from '@/app/actions/craft'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import AdminCraftCustodyActions from './AdminCraftCustodyActions'

interface Props {
  config: CraftBoxConfig
  tasks: CraftQueueItem[]
  canMoveCustody: boolean
  canReturnCustody: boolean
}

// 보관함 번호 점유 현황. delivered 상태로 box_number 가 잡혀있는 작업만 추려서
// 어드민이 한눈에 "지금 몇 번 박스 누가 쓰고 있는지" 확인할 수 있게 한다. 회수
// (collected) / 명시적 미수령 반납은 상태를 종료해 번호를 이력으로만 보존한다.
// 기한 초과는 후속 확인 표식일 뿐 보관함 점유를 자동 해제하지 않는다.
export default function AdminCraftBoxStatusPanel({
  config,
  tasks,
  canMoveCustody,
  canReturnCustody,
}: Props) {
  const t = useTranslations('adminCraft')
  const tRole = useTranslations('slotRole')

  const inUse = useMemo(
    () =>
      tasks
        .filter(
          (task): task is CraftQueueItem & { boxNumber: number } =>
            task.status === 'delivered' && task.boxNumber != null,
        )
        .sort((a, b) => a.boxNumber - b.boxNumber),
    [tasks],
  )

  if (!config.enabled) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('boxStatusTitle')}
        </h2>
        <p className="text-xs text-gray-500">{t('boxStatusDisabled')}</p>
      </section>
    )
  }

  const totalRange = Math.max(0, config.rangeMax - config.rangeMin + 1)
  const usedCount = inUse.length
  const availableCount = Math.max(0, totalRange - usedCount)

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('boxStatusTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('boxStatusHint')}</p>
      </div>

      <p className="text-xs text-gray-300">
        {t('boxStatusRangeLine', {
          min: config.rangeMin,
          max: config.rangeMax,
          used: usedCount,
          available: availableCount,
        })}
      </p>

      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('boxStatusInUseTitle')}
        </p>
        {inUse.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
            {t('boxStatusEmpty')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {inUse.map((task) => (
              <li
                key={task.taskId}
                className="bg-gray-950 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-gray-200 flex flex-wrap items-center gap-2"
              >
                <span className="font-mono text-emerald-300 font-bold flex-shrink-0">
                  #{task.boxNumber}
                </span>
                <span className="text-gray-500">·</span>
                <span className="truncate">
                  {translateSlotRole(task.roleName, tRole)}
                </span>
                <span className="text-gray-500">·</span>
                <span className="text-gray-400 truncate">{task.requesterUsername}</span>
                {task.supplyStatus === 'receipt_overdue' && (
                  <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
                    {t('boxReceiptOverdue')}
                  </span>
                )}
                <AdminCraftCustodyActions
                  taskId={task.taskId}
                  currentBox={task.boxNumber}
                  canMove={canMoveCustody}
                  canReturn={canReturnCustody}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
