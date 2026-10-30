/**
 * MCP servers one user of your product makes: for an agent or an AI product they build in it, each with its own MCP URL.
 *
 * The calls go to the MCP management API (https://mcp.viasocket.com/api-reference.md) with a token for that user only
 * (GET /embed/mcp/token, signed by your embed secret through their embed token): every server, skill and prompt it
 * makes is that user's, and it sees nothing else, neither another user's nor your own. `sync` takes the same definition
 * as the `viasocket.mcp.json` of `npx viasocket-apps mcp`, without the slug (a URL alias is yours, not a user's).
 */

import { ViaSocketError } from './errors.js'

export interface McpToolApi {
  /** Your API's https URL; `{{argument}}` placeholders are filled from the tool's arguments. */
  url: string
  /** GET sends the other arguments as the query string; the rest as the JSON body. Default POST. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Fixed headers; `{{argument}}` placeholders allowed. Leave the token header out: the caller's token is added. */
  headers?: Record<string, string>
  /** Where the caller's token goes, default `Authorization`. */
  tokenHeader?: string
  /** Put in front of the token, such as `Bearer`; without it the token goes bare. */
  tokenPrefix?: string
  /** Arguments sent in the query string even on a POST, PUT, PATCH or DELETE. */
  queryParams?: string[]
}

export interface McpTool {
  /** snake_case, at most 45 characters, unique on the server. */
  name: string
  /** One sentence on when the AI should use it. */
  description: string
  api: McpToolApi
  /** JSON Schema of the arguments, `type: "object"`, with a description per field. */
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }
}

export interface McpSkill {
  name: string
  /** One sentence on when the model should load it. */
  description: string
  /** Markdown: the job, the tools in order. */
  content: string
}

export interface McpPrompt {
  name: string
  title?: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
  /** The request, with `{{argument}}` placeholders. */
  content: string
}

export interface McpLogin {
  /** `none` (public tools), `api-key` (a key the caller puts in their client's headers) or `oauth` (a sign-in). */
  mode: 'none' | 'api-key' | 'oauth'
  /** An endpoint of yours that answers 200 for a valid token. Not for `none`. */
  validationUrl?: string
  headerName?: string
  method?: 'GET' | 'POST'
  loginUrl?: string
  tokenUrl?: string
  clientId?: string
  clientSecret?: string
  /** `needed` (OAuth only): open to connect, sign-in when a tool's API answers 401. Default: every request. */
  when?: 'always' | 'needed'
}

export interface McpServerDefinition {
  /** Shown to the user's AI client. */
  name: string
  /** One paragraph every client reads at connect: what the server is, which tool to start with. */
  instructions?: string
  branding?: { title?: string; websiteUrl?: string; iconUrl?: string }
  login?: McpLogin
  tools: McpTool[]
  skills?: McpSkill[]
  prompts?: McpPrompt[]
}

/** What `sync` made, by name. Save it with the server (in your database) and pass it to the next `sync`. */
export interface McpServerIds {
  server?: string
  url?: string
  tools: Record<string, string>
  skills: Record<string, string>
  prompts: Record<string, string>
}

export interface McpSyncResult {
  ids: McpServerIds
  /** The MCP URL to give the user: they add it to Claude, ChatGPT, Cursor or another agent. */
  url: string
  /** What changed, in plain words: `server created; tool get_order created; …`. */
  changes: string[]
}

export interface McpServerSummary {
  id: string
  name: string
  url: string
}

export interface McpToken {
  token: string
  expiresIn: number
  /** The management API's base URL. */
  api: string
}

/** One call to the management API as this user; the envelope's data. */
export type McpApi = <T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => Promise<T>

const NAME = /^[a-z0-9_]{1,45}$/
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const invalid = (what: string) => new ViaSocketError(`mcp.sync: ${what}`, { status: null })

/** The definition, checked by key before anything is made. */
function check(definition: McpServerDefinition): Required<Pick<McpServerDefinition, 'login' | 'skills' | 'prompts'>> & McpServerDefinition {
  if (!definition || typeof definition !== 'object') throw invalid('the definition is an object')
  if (!definition.name || typeof definition.name !== 'string') throw invalid('"name" is required')
  if ((definition as { slug?: unknown }).slug !== undefined)
    throw invalid('"slug" is not for a user\'s server: it is reached at its own /mcp/<id> URL')
  const login = definition.login ?? { mode: 'none' as const }
  if (!['none', 'api-key', 'oauth'].includes(login.mode)) throw invalid('"login.mode" is "none", "api-key" or "oauth"')
  if (login.mode !== 'none' && !login.validationUrl) throw invalid('"login.validationUrl" (answers 200 for a valid token) is required')
  if (login.mode === 'oauth')
    for (const key of ['loginUrl', 'tokenUrl', 'clientId', 'clientSecret'] as const)
      if (!login[key]) throw invalid(`"login.${key}" is required for an OAuth login`)
  if (!Array.isArray(definition.tools) || !definition.tools.length) throw invalid('"tools" needs at least one tool')
  const names = new Set<string>()
  definition.tools.forEach((tool, index) => {
    const at = `tools[${index}]`
    if (!NAME.test(String(tool?.name ?? ''))) throw invalid(`${at}.name is snake_case, at most 45 characters`)
    if (names.has(tool.name)) throw invalid(`${at}.name "${tool.name}" is used twice`)
    names.add(tool.name)
    if (!tool.description) throw invalid(`${at}.description (when the AI should use it) is required`)
    if (!tool.api?.url || !/^https:\/\//.test(tool.api.url)) throw invalid(`${at}.api.url is an https URL`)
    if (tool.api.method && !METHODS.includes(String(tool.api.method).toUpperCase()))
      throw invalid(`${at}.api.method is one of ${METHODS.join(', ')}`)
    if (tool.inputSchema && (tool.inputSchema as { type?: unknown }).type !== 'object')
      throw invalid(`${at}.inputSchema has "type": "object"`)
    const tokenHeader = (tool.api.tokenHeader || 'Authorization').toLowerCase()
    if (login.mode !== 'none' && Object.keys(tool.api.headers ?? {}).some((header) => header.toLowerCase() === tokenHeader))
      throw invalid(`${at}.api.headers sets the token header itself, so the caller's token would never reach it`)
  })
  for (const [index, skill] of (definition.skills ?? []).entries()) {
    if (!NAME.test(String(skill?.name ?? ''))) throw invalid(`skills[${index}].name is snake_case, at most 45 characters`)
    if (!skill.description || !skill.content) throw invalid(`skills[${index}] needs a description and content`)
  }
  for (const [index, prompt] of (definition.prompts ?? []).entries()) {
    if (!NAME.test(String(prompt?.name ?? ''))) throw invalid(`prompts[${index}].name is snake_case, at most 45 characters`)
    if (!prompt.content) throw invalid(`prompts[${index}].content is required`)
    for (const argument of prompt.arguments ?? [])
      if (!argument?.name || !prompt.content.includes(`{{${argument.name}}}`))
        throw invalid(`prompts[${index}]: argument "${argument?.name}" is not used as {{${argument?.name}}} in content`)
  }
  return { ...definition, login, skills: definition.skills ?? [], prompts: definition.prompts ?? [] }
}

const statusOf = (error: unknown) => (error as ViaSocketError)?.status
const ignore404 = (error: unknown) => {
  if (statusOf(error) !== 404) throw error
}

/**
 * Creates the server, or updates the one `saved` names, so it matches the definition: its login, branding, tools,
 * skills and prompts; what the definition no longer lists is removed. If it throws, `error.ids` holds what was made
 * so far: save that too, so a retry updates instead of duplicating.
 */
export async function syncMcpServer(
  api: McpApi,
  host: string,
  input: McpServerDefinition,
  saved?: Partial<McpServerIds> | null
): Promise<McpSyncResult> {
  const definition = check(input)
  const ids: McpServerIds = {
    ...(saved ?? {}),
    tools: { ...(saved?.tools ?? {}) },
    skills: { ...(saved?.skills ?? {}) },
    prompts: { ...(saved?.prompts ?? {}) }
  }
  const changes: string[] = []
  try {
    const { login } = definition
    const externalAuth =
      login.mode === 'none'
        ? null
        : {
            validationUrl: login.validationUrl,
            headerName: login.headerName || 'Authorization',
            method: login.method || 'GET',
            ...(login.mode === 'oauth'
              ? { loginUrl: login.loginUrl, tokenUrl: login.tokenUrl, clientId: login.clientId, clientSecret: login.clientSecret }
              : {})
          }
    const isAuthenticationEnabled = login.mode !== 'none' && login.when !== 'needed'

    if (!ids.server) {
      const created = await api<{ _id?: string; url?: string }>('POST', '/mcp', {
        name: definition.name,
        isAuthenticationEnabled,
        ...(externalAuth ? { externalAuth } : {})
      })
      if (!created?._id) throw new ViaSocketError('mcp.sync: the server was created but its id was not in the reply', { status: null })
      ids.server = String(created._id)
      ids.url = created.url || `${host}/mcp/${ids.server}`
      changes.push('server created')
    } else changes.push('server updated')
    await api('PUT', `/mcp/${ids.server}`, {
      name: definition.name,
      isAuthenticationEnabled,
      externalAuth,
      branding: {
        name: definition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: definition.branding?.title || definition.name,
        ...(definition.branding?.websiteUrl ? { websiteUrl: definition.branding.websiteUrl } : {}),
        ...(definition.branding?.iconUrl ? { iconUrl: definition.branding.iconUrl } : {}),
        ...(definition.instructions ? { instructions: definition.instructions } : {})
      }
    })

    for (const tool of definition.tools) {
      const known = ids.tools[tool.name]
      const saved = await api<{ _id?: string }>('POST', '/tool', {
        type: 'custom',
        mcpServerId: ids.server,
        ...(known ? { toolId: known } : {}),
        title: tool.name,
        desc: tool.description,
        apiConfig: { ...tool.api, method: String(tool.api.method || 'POST').toUpperCase() },
        payload: {
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
          ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {})
        },
        ...(tool.annotations ? { annotations: tool.annotations } : {})
      })
      if (!saved?._id) throw new ViaSocketError(`mcp.sync: tool ${tool.name} was saved but its id was not in the reply`, { status: null })
      ids.tools[tool.name] = String(saved._id)
      changes.push(`tool ${tool.name} ${known ? 'updated' : 'created'}`)
    }
    for (const [name, id] of Object.entries(ids.tools)) {
      if (definition.tools.some((tool) => tool.name === name)) continue
      await api('DELETE', `/tool/id/${id}`).catch(ignore404)
      delete ids.tools[name]
      changes.push(`tool ${name} removed`)
    }

    const words = async <T extends { name: string }>(kind: 'skill' | 'prompt', items: T[], body: (item: T) => unknown) => {
      const known = ids[`${kind}s`]
      // One this server already has but the ids lack (lost, or from an older layout) is reused by name, never another's.
      const onServer = items.some((item) => !known[item.name])
        ? await api<Array<{ _id?: string; name?: string }>>('GET', `/${kind}s/${ids.server}`).catch(() => [])
        : []
      for (const item of items) {
        if (!known[item.name]) {
          const same = (Array.isArray(onServer) ? onServer : []).find((entry) => entry?.name === item.name && entry?._id)
          if (same) known[item.name] = String(same._id)
        }
        const existed = Boolean(known[item.name])
        if (existed) await api('PUT', `/${kind}/${known[item.name]}`, body(item))
        else {
          const created = await api<{ _id?: string }>('POST', `/${kind}`, body(item)).catch((error) => {
            const said = `${(error as ViaSocketError)?.message ?? ''} ${JSON.stringify((error as ViaSocketError)?.body ?? '')}`
            if ((statusOf(error) === 400 || statusOf(error) === 409) && /E11000|duplicate|unique|already exists/i.test(said))
              throw new ViaSocketError(
                `mcp.sync: this user already has a ${kind} named ${item.name} on another server; name this one differently`,
                {
                  status: statusOf(error) ?? null
                }
              )
            throw error
          })
          if (!created?._id)
            throw new ViaSocketError(`mcp.sync: ${kind} ${item.name} was created but its id was not in the reply`, { status: null })
          known[item.name] = String(created._id)
        }
        await api('POST', `/mcp/${ids.server}/${kind}/${known[item.name]}`)
        changes.push(`${kind} ${item.name} ${existed ? 'updated' : 'created'}`)
      }
      for (const [name, id] of Object.entries(known)) {
        if (items.some((item) => item.name === name)) continue
        await api('DELETE', `/mcp/${ids.server}/${kind}/${id}`).catch(ignore404)
        await api('DELETE', `/${kind}/${id}`).catch(ignore404)
        delete known[name]
        changes.push(`${kind} ${name} removed`)
      }
    }
    await words('skill', definition.skills, (skill) => ({ name: skill.name, description: skill.description, content: skill.content }))
    await words('prompt', definition.prompts, (prompt) => ({
      name: prompt.name,
      title: prompt.title || prompt.name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      description: prompt.description || '',
      arguments: prompt.arguments || [],
      content: prompt.content
    }))
  } catch (error) {
    if (error && typeof error === 'object') (error as { ids?: McpServerIds }).ids = ids
    throw error
  }
  return { ids, url: ids.url || `${host}/mcp/${ids.server}`, changes }
}

/** Deletes a server `sync` made, with its tools, skills and prompts. Something already gone is not an error. */
export async function removeMcpServer(api: McpApi, ids: Partial<McpServerIds>): Promise<void> {
  if (ids?.server) await api('DELETE', `/mcp/${ids.server}`).catch(ignore404)
  for (const id of Object.values(ids?.skills ?? {})) await api('DELETE', `/skill/${id}`).catch(ignore404)
  for (const id of Object.values(ids?.prompts ?? {})) await api('DELETE', `/prompt/${id}`).catch(ignore404)
}
