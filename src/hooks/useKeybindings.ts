import { useEffect, useState } from 'react'
import { DEFAULT_KEYBINDINGS, type KeybindingRule } from '@shared/keybindings'

export function useKeybindings() {
  const [keybindings, setKeybindings] = useState<KeybindingRule[]>(DEFAULT_KEYBINDINGS)
  const [keybindingsPath, setKeybindingsPath] = useState<string>('')

  useEffect(() => {
    window.hydra.getKeybindings().then(setKeybindings).catch(() => {
      setKeybindings(DEFAULT_KEYBINDINGS)
    })
    window.hydra.getKeybindingsPath().then(setKeybindingsPath).catch(() => {
      setKeybindingsPath('')
    })

    const unsubscribe = window.hydra.onKeybindingsChange((next) => {
      setKeybindings(next)
    })

    return unsubscribe
  }, [])

  return {
    keybindings,
    keybindingsPath
  }
}
