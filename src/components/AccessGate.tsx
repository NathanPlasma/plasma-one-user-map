import { useRef, useState, type FormEvent, type ReactNode } from 'react'

const PRODUCTION_ACCESS_PASSWORD_SHA256 =
  'f612b3bc8cd19a0111eb7361b8360fdecc376f3f473ef09eda89e577635bc53d'
const e2eAccessPasswordHash = import.meta.env.VITE_E2E_ACCESS_PASSWORD_SHA256
const ACCESS_PASSWORD_SHA256 =
  import.meta.env.VITE_E2E_ACCESS_GATE === 'true' &&
  /^[a-f0-9]{64}$/.test(e2eAccessPasswordHash ?? '')
    ? e2eAccessPasswordHash
    : PRODUCTION_ACCESS_PASSWORD_SHA256

export const ACCESS_SESSION_KEY = `plasma-one-user-map:access-granted:${ACCESS_PASSWORD_SHA256.slice(0, 12)}`

type AccessStorage = Pick<Storage, 'getItem' | 'setItem'>
type PasswordVerifier = (password: string) => Promise<boolean>

type AccessGateProps = {
  children: ReactNode
  storage?: AccessStorage
  verifyPassword?: PasswordVerifier
}

function hasSessionAccess(storage?: AccessStorage): boolean {
  try {
    return (storage ?? window.sessionStorage).getItem(ACCESS_SESSION_KEY) === 'granted'
  } catch {
    return false
  }
}

function saveSessionAccess(storage?: AccessStorage): void {
  try {
    const sessionStorage = storage ?? window.sessionStorage
    sessionStorage.setItem(ACCESS_SESSION_KEY, 'granted')
  } catch {
    // The current page still unlocks when a browser blocks session storage.
  }
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function verifyAccessPassword(password: string): Promise<boolean> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password),
  )
  return bytesToHex(digest) === ACCESS_PASSWORD_SHA256
}

export function AccessGate({
  children,
  storage,
  verifyPassword = verifyAccessPassword,
}: AccessGateProps) {
  const [unlocked, setUnlocked] = useState(() => hasSessionAccess(storage))
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)

  if (unlocked) return children

  const rejectPassword = (message: string) => {
    setPassword('')
    setError(message)
    inputRef.current?.focus()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password || checking) return
    setChecking(true)
    setError(undefined)

    try {
      if (!(await verifyPassword(password))) {
        rejectPassword('Incorrect password.')
        return
      }
      saveSessionAccess(storage)
      setUnlocked(true)
    } catch {
      rejectPassword('Unable to verify the password in this browser.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="access-gate">
      <section className="access-gate-card" aria-labelledby="access-gate-title">
        <p className="access-gate-eyebrow">Workshop access</p>
        <h1 id="access-gate-title">Plasma One User Map</h1>
        <p className="access-gate-copy">Enter the password to open the workshop.</p>

        <form
          className="access-gate-form"
          noValidate
          onSubmit={(event) => void submit(event)}
        >
          <label htmlFor="access-password">Password</label>
          <input
            ref={inputRef}
            id="access-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            aria-describedby={error ? 'access-gate-error' : undefined}
            aria-invalid={Boolean(error)}
            value={password}
            onChange={(event) => {
              setPassword(event.currentTarget.value)
              setError(undefined)
            }}
          />
          <button type="submit" disabled={!password || checking}>
            {checking ? 'Checking…' : 'Open workshop'}
          </button>
          {error ? (
            <p id="access-gate-error" className="access-gate-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  )
}
