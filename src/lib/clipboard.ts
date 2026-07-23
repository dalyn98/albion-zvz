interface TextAreaLike {
  value?: string
  select: () => void
  remove: () => void
  setAttribute?: (name: string, value: string) => void
  style?: {
    position?: string
    opacity?: string
    pointerEvents?: string
  }
}

interface CopyDependencies {
  writeText?: (value: string) => Promise<void>
  createTextArea?: () => TextAreaLike
  append?: (textarea: TextAreaLike) => void
  execCommand?: (command: string) => boolean
}

function browserDependencies(): CopyDependencies {
  if (typeof document === 'undefined') return {}
  return {
    writeText:
      typeof navigator !== 'undefined' && navigator.clipboard
        ? (value) => navigator.clipboard.writeText(value)
        : undefined,
    createTextArea: () => document.createElement('textarea'),
    append: (textarea) => document.body.appendChild(textarea as HTMLTextAreaElement),
    execCommand: (command) => document.execCommand(command),
  }
}

export async function copyTextWithFallback(
  value: string,
  dependencies: CopyDependencies = browserDependencies(),
): Promise<boolean> {
  if (dependencies.writeText) {
    try {
      await dependencies.writeText(value)
      return true
    } catch {
      // Some in-app browsers expose Clipboard API but reject every call.
    }
  }

  if (!dependencies.createTextArea || !dependencies.append || !dependencies.execCommand) {
    return false
  }

  const textarea = dependencies.createTextArea()
  textarea.value = value
  textarea.setAttribute?.('readonly', '')
  if (textarea.style) {
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
  }

  try {
    dependencies.append(textarea)
    textarea.select()
    return dependencies.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
