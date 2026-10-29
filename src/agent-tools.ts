/**
 * The actions of apps a user connected, as tools an AI agent can call — framework-neutral: a name,
 * a description, a JSON Schema for the input and an `invoke`. `viasocket-apps/langchain` wraps
 * these for LangChain; any other framework that takes a JSON Schema can wrap them the same way.
 */

import type { ViaSocket } from './client.js'
import { ViaSocketError } from './errors.js'
import type { CatalogAction, Flow } from './types.js'

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

/** Says where a picker field's values come from: `field` is its full key, as `listOptions` takes it. */
type PickerHint = (field: string) => string

function describe(block: Block, picker: string | false): string {
  const parts = [block.label, block.help ?? block.customHelp]
  if (picker) parts.push(picker)
  if (block.dateFormat) parts.push(`Format: ${block.dateFormat}.`)
  // A choice field's placeholder is UI copy ("Select Channel"); only a typed value's is an example.
  const choice = block.type === 'dropdown' || block.type === 'multiselect' || block.type === 'boolean'
  if (block.placeholder && !choice) parts.push(`Example: ${block.placeholder}`)
  // The condition is JavaScript over the other fields, which a model reads well once the prefix is gone.
  if (block.visibilityCondition) parts.push(`Only when: ${block.visibilityCondition.replace(/context\??\.inputData\??\.?/g, '')}`)
  return parts.filter(Boolean).join(' — ')
}

/** One field of the form as JSON Schema, or null for what is not input (help text). */
function fieldSchema(
  block: Block,
  key: string,
  steps: Record<string, string[]>,
  blocks: Record<string, Block>,
  hint: PickerHint
): JsonSchema | null {
  const picker = () => hint(block.key || key)
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
      return values ? { enum: values, description: describe(block, false) } : { type: 'string', description: describe(block, picker()) }
    }
    case 'multiselect': {
      const values = staticValues(block)
      return {
        type: 'array',
        items: values ? { enum: values } : { type: 'string' },
        description: describe(block, values ? false : picker())
      }
    }
    case 'dictionary':
      return { type: 'object', additionalProperties: { type: 'string' }, description: describe(block, false) }
    case 'input groups':
      return { ...objectSchema(key, steps, blocks, hint), description: describe(block, false) }
    default:
      return null
  }
}

function objectSchema(parent: string, steps: Record<string, string[]>, blocks: Record<string, Block>, hint: PickerHint): JsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const key of steps[parent] ?? []) {
    const block = blocks[key]
    if (!block) continue
    const schema = fieldSchema(block, key, steps, blocks, hint)
    if (!schema) continue
    // `destination.channel_id` is `channel_id` inside `destination`, as inputData nests it.
    const name = key.slice(key.lastIndexOf('.') + 1)
    properties[name] = schema
    // A field shown only under a condition cannot be required of every call.
    if (block.required && !block.visibilityCondition) required.push(name)
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

const DEFAULT_HINT: PickerHint = () => "An id from the user's account, not a display name."

/**
 * An action's `input_schema` — the form viaSocket renders — as the JSON Schema a model fills. `hint`
 * words the description of a field whose values come from the user's account (a channel, a sheet).
 */
export function actionInputSchema(inputSchema: Record<string, unknown>, hint: PickerHint = DEFAULT_HINT): JsonSchema {
  const steps = (inputSchema?.steps ?? {}) as Record<string, string[]>
  const blocks = (inputSchema?.blocks ?? {}) as Record<string, Block>
  return objectSchema('root', steps, blocks, hint)
}

const clip = (text: string) => (text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}… (truncated)` : text)

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
    const appName = app.service.name
    const notConnected = `${appName} is not connected for this user. Ask them to connect it, then try again.`

    // The user's enabled flow for this app: its script_id runs actions, its auth_id reads their account.
    // Only a found one is kept, so an app the user connects mid-conversation works on the next call.
    let flow: Flow | null = null
    const findFlow = async () =>
      (flow ??=
        (await user.listFlows()).find(
          (entry) => entry.serviceId === serviceId && (entry.status === 'active' || entry.status === 'paused')
        ) ?? null)

    const optionsTool = uniqueName(slug, 'list options')
    const withPickers = new Map<string, CatalogAction>()
    const tools: AgentTool[] = chosen.map((action: CatalogAction) => {
      const name = uniqueName(slug, action.name)
      const parameters = actionInputSchema(action.input_schema, (field) => {
        withPickers.set(name, action)
        return `An id from the user's ${appName} account, never a display name or a guess: get it with ${optionsTool} (tool "${name}", field "${field}").`
      })
      return {
        name,
        description: `${appName}: ${action.description || action.name}`,
        parameters,
        invoke: async (input: Record<string, unknown>) => {
          try {
            const found = await findFlow()
            if (!found) return notConnected
            const result = await viasocket.runAction(found.id, action.action_version_id, input ?? {})
            return clip(typeof result === 'string' ? result : JSON.stringify(result ?? null))
          } catch (error) {
            if (error instanceof ViaSocketError) return `${appName} ${action.name} failed: ${error.message}`
            throw error
          }
        }
      }
    })
    if (!withPickers.size) {
      taken.delete(optionsTool)
      return tools
    }

    tools.push({
      name: optionsTool,
      description: `${appName}: lists the values a field of another ${appName} tool accepts (a channel, a sheet, a list), read from the user's own ${appName} account. Call it before filling a field whose description names this tool; send the value, show the label.`,
      parameters: {
        type: 'object',
        properties: {
          tool: { enum: [...withPickers.keys()], description: 'The tool whose field needs values.' },
          field: { type: 'string', description: 'The field, exactly as its description names it, such as "destination.channel_id".' },
          chosen: {
            type: 'object',
            description:
              'What is already chosen for that tool, in the same shape as its input. A field that depends on another (a sheet inside a spreadsheet) lists nothing until that one is here.'
          },
          search: { type: 'string', description: 'Words to narrow a long list, such as part of a channel name.' }
        },
        required: ['tool', 'field']
      },
      invoke: async (input: Record<string, unknown>) => {
        const action = withPickers.get(String(input?.tool ?? ''))
        if (!action) return `Unknown tool "${input?.tool}": use one of ${[...withPickers.keys()].join(', ')}.`
        try {
          const found = await findFlow()
          if (!found) return notConnected
          const chosenSoFar = input?.chosen && typeof input.chosen === 'object' ? (input.chosen as Record<string, unknown>) : {}
          const existingFields = input?.search ? { ...chosenSoFar, _searchText: String(input.search) } : chosenSoFar
          const { options: values, offset } = await user.listOptions(action.action_version_id, {
            fieldKey: String(input?.field ?? ''),
            authId: found.authId,
            existingFields
          })
          if (!values.length)
            return 'No values. If this field depends on another, put that one in "chosen" first, or try other search words.'
          return clip(JSON.stringify({ options: values.map(({ label, value }) => ({ label, value })), more: Boolean(offset) }))
        } catch (error) {
          if (error instanceof ViaSocketError) return `${appName}: listing values failed: ${error.message}`
          throw error
        }
      }
    })
    return tools
  })
}
