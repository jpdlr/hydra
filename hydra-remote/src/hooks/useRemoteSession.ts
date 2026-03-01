import { useState, useEffect, useCallback, useRef } from 'react'
import { initializeApp, FirebaseApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, Auth } from 'firebase/auth'
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Firestore,
  Unsubscribe
} from 'firebase/firestore'

type FirebaseEnvKey =
  | 'VITE_FIREBASE_API_KEY'
  | 'VITE_FIREBASE_AUTH_DOMAIN'
  | 'VITE_FIREBASE_PROJECT_ID'
  | 'VITE_FIREBASE_STORAGE_BUCKET'
  | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
  | 'VITE_FIREBASE_APP_ID'

interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

function readRequiredFirebaseEnv(key: FirebaseEnvKey): string {
  const value = import.meta.env[key]?.trim()
  if (value) return value
  throw new Error(
    `Missing required Firebase env var: ${key}. Configure VITE_FIREBASE_* before connecting.`
  )
}

function getFirebaseConfig(): FirebaseConfig {
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim()

  return {
    apiKey: readRequiredFirebaseEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readRequiredFirebaseEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readRequiredFirebaseEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: readRequiredFirebaseEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readRequiredFirebaseEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readRequiredFirebaseEnv('VITE_FIREBASE_APP_ID'),
    ...(measurementId ? { measurementId } : {})
  }
}

interface AgentSummary {
  agentId: string
  name: string
  status: 'running' | 'idle' | 'errored' | 'starting'
  model: string
  provider: string
  projectDir: string
  sessionId: string | null
  createdAt?: string
  startedAt?: string | null
}

interface OutboxMessage {
  id: string
  type: 'output' | 'status' | 'notification' | 'agent_list'
  payload: Record<string, unknown>
  timestamp: string
}

type InboxMessageType = 'handshake' | 'prompt' | 'kill' | 'create' | 'restart' | 'broadcast'

interface QrPayload {
  sessionId: string
  mobileToken: string
  projectId: string
}

export function useRemoteSession() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [messages, setMessages] = useState<OutboxMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)

  const firebaseAppRef = useRef<FirebaseApp | null>(null)
  const firestoreRef = useRef<Firestore | null>(null)
  const authRef = useRef<Auth | null>(null)
  const unsubscribesRef = useRef<Unsubscribe[]>([])

  const sendInboxMessage = useCallback(
    async (type: InboxMessageType, payload: Record<string, unknown>) => {
      if (!firestoreRef.current || !sessionId) return

      const inboxRef = collection(firestoreRef.current, 'sessions', sessionId, 'inbox')
      await addDoc(inboxRef, {
        type,
        payload,
        timestamp: new Date().toISOString(),
        processed: false
      })
    },
    [sessionId]
  )

  const connect = useCallback(async (qrData: string) => {
    setConnecting(true)
    setError(null)

    try {
      const payload: QrPayload = JSON.parse(qrData)

      // Use projectId from QR if different from configured env project.
      const config = { ...getFirebaseConfig() }
      if (payload.projectId) {
        config.projectId = payload.projectId
      }

      // Init Firebase
      if (!firebaseAppRef.current) {
        firebaseAppRef.current = initializeApp(config, 'hydra-remote-mobile')
      }

      const auth = getAuth(firebaseAppRef.current)
      const firestore = getFirestore(firebaseAppRef.current)
      authRef.current = auth
      firestoreRef.current = firestore

      // Auth with mobile token
      await signInWithCustomToken(auth, payload.mobileToken)
      setSessionId(payload.sessionId)
      // Signal desktop that mobile has successfully connected.
      const inboxRef = collection(firestore, 'sessions', payload.sessionId, 'inbox')
      await addDoc(inboxRef, {
        type: 'handshake',
        payload: { source: 'hydra-remote-mobile' },
        timestamp: new Date().toISOString(),
        processed: false
      })

      // Listen to agent state
      const stateRef = collection(firestore, 'sessions', payload.sessionId, 'state')
      const stateUnsub = onSnapshot(stateRef, (snapshot) => {
        const agentList: AgentSummary[] = []
        snapshot.forEach((doc) => {
          agentList.push(doc.data() as AgentSummary)
        })
        setAgents(agentList)
      })

      // Listen to outbox (latest 100 messages)
      const outboxRef = collection(firestore, 'sessions', payload.sessionId, 'outbox')
      const outboxQuery = query(outboxRef, orderBy('timestamp', 'desc'), limit(100))
      const outboxUnsub = onSnapshot(outboxQuery, (snapshot) => {
        const msgs: OutboxMessage[] = []
        snapshot.forEach((doc) => {
          msgs.push(doc.data() as OutboxMessage)
        })
        setMessages(msgs.reverse())
      })

      unsubscribesRef.current = [stateUnsub, outboxUnsub]
      setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }, [])

  const sendCommand = useCallback(
    async (
      type: 'prompt' | 'kill' | 'create' | 'restart' | 'broadcast',
      payload: Record<string, unknown>
    ) => {
      await sendInboxMessage(type, payload)
    },
    [sendInboxMessage]
  )

  const disconnect = useCallback(() => {
    for (const unsub of unsubscribesRef.current) {
      unsub()
    }
    unsubscribesRef.current = []
    setConnected(false)
    setSessionId(null)
    setAgents([])
    setMessages([])
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const unsub of unsubscribesRef.current) {
        unsub()
      }
    }
  }, [])

  return {
    connected,
    connecting,
    error,
    agents,
    messages,
    sessionId,
    connect,
    sendCommand,
    disconnect
  }
}
