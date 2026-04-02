import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { fetchPaperStatuses, setPaperStatus } from '@/api/graph'
import { getErrorMessage } from '@/lib/errors'
import type { PaperStatus } from '@/types/graph'

export function useUser(userId: string) {
  const [paperStatuses, setPaperStatuses] = useState<Record<string, PaperStatus>>({})

  const toggleRead = useCallback(async (paperId: string) => {
    const currentStatus = paperStatuses[paperId]
    const nextStatus: PaperStatus = currentStatus === 'read' ? 'to_read' : 'read'
    return setStatus(paperId, nextStatus)
  }, [paperStatuses])

  const setStatus = useCallback(async (paperId: string, status: PaperStatus) => {
    const previous = paperStatuses
    setPaperStatuses((current) => ({ ...current, [paperId]: status }))
    try {
      const response = await setPaperStatus(userId, paperId, status)
      setPaperStatuses(Object.fromEntries(response.statuses.map((item) => [item.paper_id, item.status])))
    } catch (error) {
      setPaperStatuses(previous)
      toast.error(getErrorMessage(error, 'Failed to update paper status'))
    }
  }, [paperStatuses, userId])

  const refreshStatuses = useCallback(async () => {
    try {
      const response = await fetchPaperStatuses(userId)
      setPaperStatuses(Object.fromEntries(response.statuses.map((item) => [item.paper_id, item.status])))
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load saved paper statuses'))
    }
  }, [userId])

  const isRead = useCallback((paperId: string) => paperStatuses[paperId] === 'read', [paperStatuses])
  const getStatus = useCallback((paperId: string) => paperStatuses[paperId], [paperStatuses])
  const setInitialReadPaperIds = useCallback((paperIds: string[]) => {
    setPaperStatuses(Object.fromEntries(paperIds.map((paperId) => [paperId, 'read' as const])))
  }, [])

  const readPaperIds = new Set(Object.entries(paperStatuses).filter(([, status]) => status === 'read').map(([paperId]) => paperId))

  return { readPaperIds, paperStatuses, toggleRead, setStatus, isRead, getStatus, setInitialReadPaperIds, refreshStatuses }
}
