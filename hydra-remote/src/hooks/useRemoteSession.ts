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

// Firebase config — must match the Hydra desktop app's config
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDH0VZ1PNc2DmX5HSXpkDYiv7nHecrjwdE',
  authDomain: 'hydra-za.firebaseapp.com',
  projectId: 'hydra-za',
  storageBucket: 'hydra-za.firebasestorage.app',
  messagingSenderId: '548523780132',
  appId: '1:548523780132:web:7fb0ea59b2eb30ee0490b1'
}

interface AgentSummary {
  agentId: string
  name: string
  status: 'running' | 'idle' | 'errored' | 'starting'
  model: string
  provider: string
  projectDir: string
  sessionId: string | null
}

interface OutboxMessage {
  id: string
  type: 'output' | 'status' | 'notification' | 'agent_list'
  payload: Record<string, unknown>
  timestamp: string
}

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

  const connect = useCallback(async (qrData: string) => {
    setConnecting(true)
    setError(null)

    try {
      const payload: QrPayload = JSON.parse(qrData)

      // Use projectId from QR if different from hardcoded config
      const config = { ...FIREBASE_CONFIG }
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
