/**
 * The actions of apps a user connected, as tools an AI agent can call — framework-neutral: a name,
 * a description, a JSON Schema for the input and an `invoke`. `viasocket-apps/langchain` wraps
 * these for LangChain; any other framework that takes a JSON Schema can wrap them the same way.
 */

import type { ViaSocket } from './client.js'
import { ViaSocketError } from './errors.js'
import type { CatalogAction } from './types.js'

export interface AgentToolsOptions {
  /** The end user the tools act for: the same `uniqueIdentifier` their connections were made under. */
  user: string
  /** The apps, by slug (`slack`, `google-sheets`). Each must already be connected and enabled for the user. */
  apps: string[]
  /**
   * Which actions of an app, by `action_id` or path (`send-message`). An app left out gets every
   * published action — fine for a small app, too many tools for a large one (Notion has 57).
   */
  actions?: Record<string, string[]>
}

export interface AgentTool {
  /** `slack_send-message`: unique, and inside the 64 characters model APIs allow. */
  name: string
  description: string
  /** JSON Schema of the action's input, built from its `input_schema`. */
  parameters: JsonSchema
  /**
   * Runs the action and answers what the model reads: the result as JSON, or the error as a
   * sentence it can act on (an app the user has not connected, a field it got wrong). Never throws
   * for those, so one bad call does not end the agent's run.
   */
  invoke(input: Record<string, unknown>): Promise<string>
}

export type JsonSchema = Record<string, unknown>

type Block = {
  key?: string
  type?: string
  label?: string
  help?: string
  customHelp?: string
  placeholder?: string
  required?: boolean
  options?: Array<{ label?: string; value?: unknown }>
  enableSearchApi?: boolean
  willDynamicFetchOptions?: boolean
  visibilityCondition?: string
  dateFormat?: string
}

const MAX_RESULT = 20_000

/** `Send Message` → `send-message`, as the app's page names an event. */
const eventPath = (name: string) =>
  `${name || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const toolName = (slug: string, action: string) => `${slug}_${eventPath(action)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)

/** The fixed values of a dropdown, or null for a picker whose values come from the user's account. */
function staticValues(block: Block): unknown[] | null {
  if (block.enableSearchApi || block.willDynamicFetchOptions) return null
  const values = (block.options ?? []).map((option) => option?.value).filter((value) => value !== undefined && value !== '')
  return values.length ? values : null
}

function describe(block: Block, picker: boolean): string {
  const parts = [block.label, block.help ?? block.customHelp]
  if (picker) parts.push("An id from the user's account, not a display name.")
  if (block.dateFormat) parts.push(`Format: ${block.dateFormat}.`)
  // A choice field's placeholder is UI copy ("Select Channel"); only a typed value's is an example.
  const choice = block.type === 'dropdown' || block.type === 'multiselect' || block.type === 'boolean'
  if (block.placeholder && !choice) parts.push(`Example: ${block.placeholder}`)
  // The condition is JavaScript over the other fields, which a model reads well once the prefix is gone.
  if (block.visibilityCondition) parts.push(`Only when: ${block.visibilityCondition.replace(/context\??\.inputData\??\.?/g, '')}`)
  return parts.filter(Boolean).join(' — ')
}

/** One field of the form as JSON Schema, or null for what is not input (help text). */
function fieldSchema(block: Block, key: string, steps: Record<string, string[]>, blocks: Record<string, Block>): JsonSchema | null {
  switch (block.type) {
    case 'string':
    case 'markdown':
    case 'aifield':
    case 'date':
      return { type: 'string', description: describe(block, false) }
    case 'number':
      return { type: 'number', description: describe(block, false) }
    case 'boolean':
      return { type: 'boolean', description: describe(block, false) }
    case 'dropdown': {
      const values = staticValues(block)
      return values ? { enum: values, description: describe(block, false) } : { type: 'string', description: describe(block, true) }
    }
    case 'multiselect': {
      const values = staticValues(block)
      return { type: 'array', items: values ? { enum: values } : { type: 'string' }, description: describe(block, !values) }
    }
    case 'dictionary':
      return { type: 'object', additionalProperties: { type: 'string' }, description: describe(block, false) }
    case 'input groups':
      return { ...objectSchema(key, steps, blocks), description: describe(block, false) }
    default:
      return null
  }
}

function objectSchema(parent: string, steps: Record<string, string[]>, blocks: Record<string, Block>): JsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const key of steps[parent] ?? []) {
    const block = blocks[key]
    if (!block) continue
    const schema = fieldSchema(block, key, steps, blocks)
    if (!schema) continue
    // `destination.channel_id` is `channel_id` inside `destination`, as inputData nests it.
    const name = key.slice(key.lastIndexOf('.') + 1)
    properties[name] = schema
    // A field shown only under a condition cannot be required of every call.
    if (block.required && !block.visibilityCondition) required.push(name)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

/** An action's `input_schema` — the form viaSocket renders — as the JSON Schema a model fills. */
export function actionInputSchema(inputSchema: Record<string, unknown>): JsonSchema {
  const steps = (inputSchema?.steps ?? {}) as Record<string, string[]>
  const blocks = (inputSchema?.blocks ?? {}) as Record<string, Block>
  return objectSchema('root', steps, blocks)
}

/**
 * One tool per chosen action of each app. Reads the public catalog only; the user's connection is
 * looked up when a tool first runs, so building tools never fails on an app they have yet to connect.
 */
export async function agentTools(viasocket: ViaSocket, options: AgentToolsOptions): Promise<AgentTool[]> {
  const user = viasocket.user(options.user)
  const apps = await Promise.all(
    (options.apps ?? []).map(async (slug) => {
      const serviceId = await viasocket.catalog.serviceIdFor(slug)
      const app = await viasocket.catalog.versions(serviceId)
      if (!app) throw new ViaSocketError(`agentTools: "${slug}" has nothing published`, { status: null })
      return { slug, serviceId, app }
    })
  )

  const taken = new Set<string>()
  const uniqueName = (slug: string, action: string) => {
    const base = toolName(slug, action)
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 60)}_${n}`
    taken.add(name)
    return name
  }

  return apps.flatMap(({ slug, serviceId, app }) => {
    const wanted = options.actions?.[slug]
    const chosen = wanted
      ? wanted.map((event) => {
          const match = app.actions.find((action) => action.action_id === event || eventPath(action.name) === event)
          if (!match) throw new ViaSocketError(`agentTools: ${app.service.name} has no published action "${event}"`, { status: null })
          return match
        })
      : app.actions

    // Only a found script_id is kept: an app the user connects mid-conversation works on the next call.
    let scriptId: string | null = null
    const findScript = async () => (scriptId ??= await user.findEnabled(serviceId))

    return chosen.map((action: CatalogAction) => ({
      name: uniqueName(slug, action.name),
      description: `${app.service.name}: ${action.description || action.name}`,
      parameters: actionInputSchema(action.input_schema),
      invoke: async (input: Record<string, unknown>) => {
        try {
          const script = await findScript()
          if (!script) return `${app.service.name} is not connected for this user. Ask them to connect it, then try again.`
          const result = await viasocket.runAction(script, action.action_version_id, input ?? {})
          const text = typeof result === 'string' ? result : JSON.stringify(result ?? null)
          return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}… (truncated)` : text
        } catch (error) {
          if (error instanceof ViaSocketError) return `${app.service.name} ${action.name} failed: ${error.message}`
          throw error
        }
      }
    }))
  })
}
