import type { ZodType } from 'zod'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

type RequestOptions<T> = {
  body?: unknown
  method?: 'GET' | 'POST' | 'DELETE'
  schema?: ZodType<T>
}

async function parseResponse<T>(res: Response, schema?: ZodType<T>): Promise<T> {
  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  if (!text) {
    return undefined as T
  }

  const data = JSON.parse(text) as unknown
  return schema ? schema.parse(data) : (data as T)
}

async function request<T>(path: string, { body, method = 'GET', schema }: RequestOptions<T> = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }

  return parseResponse(res, schema)
}

export function apiGet<T>(path: string, schema?: ZodType<T>): Promise<T> {
  return request(path, { schema })
}

export function apiPost<T>(path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
  return request(path, { method: 'POST', body, schema })
}

export function apiDelete<T>(path: string, body?: unknown, schema?: ZodType<T>): Promise<T> {
  return request(path, { method: 'DELETE', body, schema })
}
