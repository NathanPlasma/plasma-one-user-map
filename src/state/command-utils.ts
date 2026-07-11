import type { CommandErrorCode, CommandResult } from '../domain/types'

export class MutationRejected extends Error {
  readonly code: CommandErrorCode

  constructor(code: CommandErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export function fail<T>(code: CommandErrorCode, message: string): CommandResult<T> {
  return { ok: false, code, message }
}

export function succeed<T>(value: T, contentRevision: number): CommandResult<T> {
  return { ok: true, value, contentRevision }
}
