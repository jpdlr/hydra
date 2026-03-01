import type { FirebaseOptions } from 'firebase/app'

type RequiredFirebaseEnvKey =
  | 'HYDRA_FIREBASE_API_KEY'
  | 'HYDRA_FIREBASE_AUTH_DOMAIN'
  | 'HYDRA_FIREBASE_PROJECT_ID'
  | 'HYDRA_FIREBASE_STORAGE_BUCKET'
  | 'HYDRA_FIREBASE_MESSAGING_SENDER_ID'
  | 'HYDRA_FIREBASE_APP_ID'

function readFirebaseEnvValue(name: RequiredFirebaseEnvKey): string | undefined {
  switch (name) {
    case 'HYDRA_FIREBASE_API_KEY':
      return (
        process.env.HYDRA_FIREBASE_API_KEY?.trim() ??
        process.env.MAIN_VITE_HYDRA_FIREBASE_API_KEY?.trim()
      )
    case 'HYDRA_FIREBASE_AUTH_DOMAIN':
      return (
        process.env.HYDRA_FIREBASE_AUTH_DOMAIN?.trim() ??
        process.env.MAIN_VITE_HYDRA_FIREBASE_AUTH_DOMAIN?.trim()
      )
    case 'HYDRA_FIREBASE_PROJECT_ID':
      return (
        process.env.HYDRA_FIREBASE_PROJECT_ID?.trim() ??
        process.env.MAIN_VITE_HYDRA_FIREBASE_PROJECT_ID?.trim()
      )
    case 'HYDRA_FIREBASE_STORAGE_BUCKET':
      return (
        process.env.HYDRA_FIREBASE_STORAGE_BUCKET?.trim() ??
        process.env.MAIN_VITE_HYDRA_FIREBASE_STORAGE_BUCKET?.trim()
      )
    case 'HYDRA_FIREBASE_MESSAGING_SENDER_ID':
      return (
        process.env.HYDRA_FIREBASE_MESSAGING_SENDER_ID?.trim() ??
        process.env.MAIN_VITE_HYDRA_FIREBASE_MESSAGING_SENDER_ID?.trim()
      )
    case 'HYDRA_FIREBASE_APP_ID':
      return (
        process.env.HYDRA_FIREBASE_APP_ID?.trim() ??
        process.env.MAIN_VITE_HYDRA_FIREBASE_APP_ID?.trim()
      )
  }
}

function readRequiredEnvVar(name: RequiredFirebaseEnvKey): string {
  const value = readFirebaseEnvValue(name)
  if (value) return value
  throw new Error(
    `Missing required Firebase env var: ${name}. Configure HYDRA_FIREBASE_* before enabling Remote Control.`
  )
}

export function getFirebaseConfig(): FirebaseOptions {
  const measurementId =
    process.env.HYDRA_FIREBASE_MEASUREMENT_ID?.trim() ||
    process.env.MAIN_VITE_HYDRA_FIREBASE_MEASUREMENT_ID?.trim()

  return {
    apiKey: readRequiredEnvVar('HYDRA_FIREBASE_API_KEY'),
    authDomain: readRequiredEnvVar('HYDRA_FIREBASE_AUTH_DOMAIN'),
    projectId: readRequiredEnvVar('HYDRA_FIREBASE_PROJECT_ID'),
    storageBucket: readRequiredEnvVar('HYDRA_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readRequiredEnvVar('HYDRA_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readRequiredEnvVar('HYDRA_FIREBASE_APP_ID'),
    ...(measurementId ? { measurementId } : {})
  }
}

export function getFirebaseProjectId(): string {
  return readRequiredEnvVar('HYDRA_FIREBASE_PROJECT_ID')
}
