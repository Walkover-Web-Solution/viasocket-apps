/**
 * viasocket-apps/openai-agents — the apps a user connected, as OpenAI Agents SDK tools.
 *
 *   import { ViaSocket } from 'viasocket-apps'
 *   import { viasocketTools } from 'viasocket-apps/openai-agents'
 *   import { Agent, run } from '@openai/agents'
 *
 *   const viasocket = new ViaSocket({ orgId, projectId, secret: process.env.VIASOCKET_EMBED_SECRET })
 *   const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'], actions: { slack: ['send-message'] } })
 *   const result = await run(new Agent({ name: 'Ops', instructions, tools }), 'Post our Q3 numbers in #finance')
 *
 * Needs `@openai/agents` 0.1 or later, which the app already has; nothing else is pulled in.
 */

import { tool } from '@openai/agents'
import type { FunctionTool } from '@openai/agents'
import { agentTools } from './agent-tools.js'
import type { AgentToolsOptions } from './agent-tools.js'
import type { ViaSocket } from './client.js'

export type { AgentToolsOptions } from './agent-tools.js'

/**
 * One OpenAI Agents SDK function tool per chosen action; each runs on the user's own connection.
 * The SDK turns `-` in a tool name into `_` (`slack_send-message` is called `slack_send_message`),
 * so the list-options tool's name is rewritten the same way where id fields name it. The `tool`
 * values it takes stay as they are: they name actions, not tools.
 */
export async function viasocketTools(viasocket: ViaSocket, options: AgentToolsOptions): Promise<FunctionTool[]> {
  const tools = await agentTools(viasocket, options)
  const optionsTools = tools.filter((t) => t.name.endsWith('_list-options')).map((t) => [t.name, t.name.replace(/-/g, '_')] as const)
  const rename = (text: string) => optionsTools.reduce((out, [from, to]) => out.split(from).join(to), text)
  return tools.map(
    (t) =>
      tool({
        name: t.name,
        description: rename(t.description),
        parameters: JSON.parse(rename(JSON.stringify(t.parameters))),
        // The schema is the action's own form: optional fields and open objects, which strict mode refuses.
        strict: false,
        execute: async (input: unknown) => t.invoke((input ?? {}) as Record<string, unknown>)
      }) as unknown as FunctionTool
  )
}
