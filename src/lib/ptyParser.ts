import type { ChatMessage } from '@shared/types'

let messageCounter = 0

function createId(): string {
  return `msg-${Date.now()}-${++messageCounter}`
}

// ── ANSI / control character stripping ──────────────────────────────────────

const ANSI_REGEX =
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[[\?]?[0-9;]*[hlm]|\x1b[=>]/g
const CONTROL_CHARS = /[\x00-\x08\x0e-\x1f\x7f]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '').replace(CONTROL_CHARS, '')
}

// ── Line classification ─────────────────────────────────────────────────────

// Box-drawing / decorative lines (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ╭ ╮ ╰ ╯ etc.)
const BOX_DRAWING = /^[\s─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╰╯━┃▔▁▏▕░▒▓█▌▐]+$/

// Claude CLI startup banner lines
const BANNER_PATTERNS = [
  /^claude\s+code/i, // "Claude Code v2.1.34"
  /^v\d+\.\d+/, // "v2.1.34"
  /^opus|^sonnet|^haiku/i, // "Opus 4.6 · Claude Max"
  /^~?\//,  // "~/Documents/Personal/..." (project path line)
  /^\/Users\//i, // "/Users/jp/..." absolute path as banner
  /^\/home\//i // "/home/..." absolute path as banner
]

// Status bar / cost / usage lines
const STATUS_BAR_PATTERNS = [
  /\$[\d.]+\s*(cc|today|block|hr)/i, // "$0.00 cc / $10.83 today"
  /ccusage/i, // "N/A ccusage"
  /bypass permissions/i, // "bypass permissions on"
  /shift\+tab to cycle/i, // "(shift+tab to cycle)"
  /tokens|token count/i, // token usage lines
  /^\d+[,.]?\d*\s*\(\d+%\)$/ // "106,903 (11%)" — token count
]

// Spinner / thinking characters
const THINKING_PATTERNS = [
  /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/, // Braille spinners
  /^[⣾⣽⣻⢿⡿⣟⣯⣷]/, // More braille spinners
  /^[◐◓◑◒]/, // Circle spinners
  /^[|/\-\\]$/ // Single-char ASCII spinners
]

// Tool use patterns from Claude CLI output
const TOOL_CALL_START = /^[│┌├╭].*?(Read|Write|Edit|Bash|Glob|Grep|WebFetch|WebSearch|Task|TodoRead|TodoWrite|Skill)/
const TOOL_CALL_RESULT = [
  /^[│├└╰]\s*(✓|✗|⚠)/,
  /^>\s*(Reading|Writing|Editing|Running|Searching|Fetching|Globbing)/i,
  /^>\s*[✓✗⚠]/
]

const CODE_BLOCK_START = /^```(\w*)/
const CODE_BLOCK_END = /^```\s*$/

// Prompt markers — lines that indicate user input in the CLI
const PROMPT_MARKER = /^[❯›>]\s*$/

function isNoiseLine(line: string): boolean {
  if (BOX_DRAWING.test(line)) return true
  if (BANNER_PATTERNS.some((p) => p.test(line))) return true
  if (STATUS_BAR_PATTERNS.some((p) => p.test(line))) return true
  if (PROMPT_MARKER.test(line)) return true
  // Lines that are just a few special chars with no alphabetic content
  if (line.length <= 3 && !/[a-zA-Z]/.test(line)) return true
  return false
}

function isThinkingLine(line: string): boolean {
  return THINKING_PATTERNS.some((p) => p.test(line))
}

function isToolCallLine(line: string): boolean {
  return TOOL_CALL_START.test(line) || TOOL_CALL_RESULT.some((p) => p.test(line))
}

// ── Parser state ────────────────────────────────────────────────────────────

interface ParserState {
  lineBuffer: string // Incomplete line from chunked data
  textAccum: string[] // Accumulated text lines for current message
  inCodeBlock: boolean
  codeBlockLang: string
  codeBlockContent: string[]
  messages: ChatMessage[]
}

export function createPtyParser() {
  const state: ParserState = {
    lineBuffer: '',
    textAccum: [],
    inCodeBlock: false,
    codeBlockLang: '',
    codeBlockContent: [],
    messages: []
  }

  function flushTextAccum(into: ChatMessage[]): void {
    if (state.textAccum.length === 0) return
    const content = state.textAccum.join('\n').trim()
    if (content) {
      into.push({
        id: createId(),
        role: 'assistant',
        content,
        timestamp: Date.now()
      })
    }
    state.textAccum = []
  }

  function parseChunk(rawData: string): ChatMessage[] {
    const cleaned = stripAnsi(rawData)
    const newMessages: ChatMessage[] = []

    // Split into lines, preserving partial lines across chunks
    state.lineBuffer += cleaned
    const lines = state.lineBuffer.split('\n')
    state.lineBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()

      // Inside a code block — accumulate until closing fence
      if (state.inCodeBlock) {
        if (CODE_BLOCK_END.test(trimmed)) {
          state.inCodeBlock = false
          flushTextAccum(newMessages)
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
        } else {
          state.codeBlockContent.push(line)
        }
        continue
      }

      // Skip empty / whitespace-only lines (don't break accumulation)
      if (!trimmed) continue

      // Skip noise lines
      if (isNoiseLine(trimmed)) continue

      // Thinking indicator — flush text, emit thinking
      if (isThinkingLine(trimmed)) {
        flushTextAccum(newMessages)
        newMessages.push({
          id: createId(),
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isThinking: true
        })
        continue
      }

      // Tool call — flush text, emit tool card
      if (isToolCallLine(trimmed)) {
        flushTextAccum(newMessages)
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

      // Code block start
      if (CODE_BLOCK_START.test(trimmed)) {
        flushTextAccum(newMessages)
        state.inCodeBlock = true
        const match = trimmed.match(CODE_BLOCK_START)
        state.codeBlockLang = match?.[1] || ''
        state.codeBlockContent = []
        continue
      }

      // Regular text — accumulate
      state.textAccum.push(trimmed)
    }

    // Don't flush at end of chunk — wait for more data.
    // Text accumulator will be flushed when a non-text element arrives,
    // or when flushPending() is called externally.

    return newMessages
  }

  /** Flush any accumulated text as a message (call on idle / role change). */
  function flushPending(): ChatMessage[] {
    const msgs: ChatMessage[] = []
    flushTextAccum(msgs)
    return msgs
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
    state.lineBuffer = ''
    state.textAccum = []
    state.inCodeBlock = false
  }

  return { parseChunk, flushPending, addUserMessage, getMessages, clear }
}

function extractToolName(line: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/Read/i, 'Read'],
    [/Write|Writing/i, 'Write'],
    [/Edit/i, 'Edit'],
    [/Bash|Running/i, 'Bash'],
    [/Glob/i, 'Glob'],
    [/Grep|Search/i, 'Grep'],
    [/Fetch/i, 'WebFetch'],
    [/Task/i, 'Task'],
    [/Skill/i, 'Skill'],
    [/TodoWrite/i, 'TodoWrite'],
    [/TodoRead/i, 'TodoRead']
  ]

  for (const [pattern, name] of patterns) {
    if (pattern.test(line)) return name
  }
  return 'Tool'
}
