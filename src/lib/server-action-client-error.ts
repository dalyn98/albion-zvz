'use client'

import { unstable_isUnrecognizedActionError } from 'next/navigation'

interface ServerActionClientErrorMessages {
  expired: string
  fallback: string
}

export function getServerActionClientErrorMessage(
  error: unknown,
  messages: ServerActionClientErrorMessages,
): string {
  if (unstable_isUnrecognizedActionError(error) || isServerActionNotFoundError(error)) {
    return messages.expired
  }
  return messages.fallback
}

function isServerActionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'UnrecognizedActionError' ||
    (error.message.includes('Server Action') && error.message.includes('was not found on the server'))
  )
}
