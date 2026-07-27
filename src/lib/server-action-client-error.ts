'use client'

import { unstable_isUnrecognizedActionError } from 'next/navigation'

interface ServerActionClientErrorMessages {
  expired: string
  fallback: string
}

export type ServerActionClientErrorKind = 'expired' | 'failed'

export function getServerActionClientErrorMessage(
  error: unknown,
  messages: ServerActionClientErrorMessages,
): string {
  if (classifyServerActionClientError(error) === 'expired') {
    return messages.expired
  }
  return messages.fallback
}

export function classifyServerActionClientError(
  error: unknown,
): ServerActionClientErrorKind | null {
  if (unstable_isUnrecognizedActionError(error) || isServerActionNotFoundError(error)) {
    return 'expired'
  }
  if (!(error instanceof Error)) return null
  if (
    error.name === 'TypeError' &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)
  ) {
    return 'failed'
  }
  if (
    /server action|server function|unexpected response was received from the server/i.test(
      error.message,
    )
  ) {
    return 'failed'
  }
  return null
}

function isServerActionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'UnrecognizedActionError' ||
    (error.message.includes('Server Action') && error.message.includes('was not found on the server'))
  )
}
