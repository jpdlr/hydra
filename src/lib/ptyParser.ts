import type { ChatMessage } from '@shared/types'

let messageCounter = 0

function createId(): string {
  return `msg-${Date.now()}-${++messageCounter}`
}

// ANSI escape code stripper
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[\?]?[0-9;]*[hlm]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}

// Detect Claude's thinking/working indicators
const THINKING_PATTERNS = [
  /^⠋|^⠙|^⠹|^⠸|^⠼|^⠴|^⠦|^⠧|^⠇|^⠏/, // Spinner characters
  /thinking/i,
  /working/i
]

// Detect tool use patterns from Claude CLI output
const TOOL_CALL_START = /^[│┌├].*?(Read|Write|Edit|Bash|Glob|Grep|WebFetch|WebSearch|Task)/
const TOOL_CALL_PATTERNS = [
  /^> (Reading|Writing|Editing|Running|Searching|Fetching)/i,
  /^> ✓/,
  /^> ✗/
]

const CODE_BLOCK_START = /^```(\w*)/
const CODE_BLOCK_END = /^```\s*$/

interface ParserState {
  currentRole: 'user' | 'assistant'
  buffer: string
  inCodeBlock: boolean
  codeBlockLang: string
  codeBlockContent: string[]
  messages: ChatMessage[]
}

export function createPtyParser() {
  const state: ParserState = {
    currentRole: 'assistant',
    buffer: '',
    inCodeBlock: false,
    codeBlockLang: '',
    codeBlockContent: [],
    messages: []
  }

  function parseChunk(rawData: string): ChatMessage[] {
    const cleaned = stripAnsi(rawData)
    const newMessages: ChatMessage[] = []

    // Split into lines but preserve partial lines
    state.buffer += cleaned
    const lines = state.buffer.split('\n')
    state.buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Detect thinking state
      const isThinking = THINKING_PATTERNS.some((p) => p.test(trimmed))
      if (isThinking) {
        // Emit thinking indicator
        newMessages.push({
          id: createId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isThinking: true
        })
        continue
      }

      // Detect tool calls
      const isToolCall =
        TOOL_CALL_START.test(trimmed) ||
        TOOL_CALL_PATTERNS.some((p) => p.test(trimmed))

      if (isToolCall) {
        newMessages.push({
          id: createId(),
          role: 'assistant',
          content: trimmed,
          timestamp: Date.now(),
          toolCall: {
            tool: extractToolName(trimmed),
            input: trimmed
          }
        })
        continue
      }

      // Handle code blocks
      if (CODE_BLOCK_START.test(trimmed) && !state.inCodeBlock) {
        state.inCodeBlock = true
        const match = trimmed.match(CODE_BLOCK_START)
        state.codeBlockLang = match?.[1] || ''
        state.codeBlockContent = []
        continue
      }

      if (CODE_BLOCK_END.test(trimmed) && state.inCodeBlock) {
        state.inCodeBlock = false
        newMessages.push({
          id: createId(),
          role: 'assistant',
          content: state.codeBlockContent.join('\n'),
          timestamp: Date.now(),
          codeBlocks: [
            {
              language: state.codeBlockLang,
              code: state.codeBlockContent.join('\n')
            }
          ]
        })
        continue
      }

      if (state.inCodeBlock) {
        state.codeBlockContent.push(line)
        continue
      }

      // Regular content — accumulate or emit
      newMessages.push({
        id: createId(),
        role: 'assistant',
        content: trimmed,
        timestamp: Date.now()
      })
    }

    return newMessages
  }

  function addUserMessage(input: string): ChatMessage {
    const msg: ChatMessage = {
      id: createId(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    }
    state.messages.push(msg)
    return msg
  }

  function getMessages(): ChatMessage[] {
    return [...state.messages]
  }

  function clear(): void {
    state.messages = []
    state.buffer = ''
    state.inCodeBlock = false
  }

  return { parseChunk, addUserMessage, getMessages, clear }
}

function extractToolName(line: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/Read/i, 'Read'],
    [/Write|Writing/i, 'Write'],
    [/Edit/i, 'Edit'],
    [/Bash|Running/i, 'Bash'],
    [/Glob/i, 'Glob'],
    [/Grep|Search/i, 'Grep'],
    [/Fetch/i, 'WebFetch']
  ]

  for (const [pattern, name] of patterns) {
    if (pattern.test(line)) return name
  }
  return 'Tool'
}
