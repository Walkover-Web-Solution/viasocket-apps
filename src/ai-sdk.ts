/**
 * viasocket-apps/ai-sdk — the apps a user connected, as Vercel AI SDK tools.
 *
 *   import { ViaSocket } from 'viasocket-apps'
 *   import { viasocketTools } from 'viasocket-apps/ai-sdk'
 *   import { generateText, stepCountIs } from 'ai'
 *
 *   const viasocket = new ViaSocket({ orgId, projectId, secret: process.env.VIASOCKET_EMBED_SECRET })
 *   const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'], actions: { slack: ['send-message'] } })
 *   const { text } = await generateText({ model, tools, stopWhen: stepCountIs(5), prompt })
 *
 * Needs `ai` 5 or later, which the app already has; nothing else is pulled in.
 */

import { jsonSchema, tool } from 'ai'
import type { Tool } from 'ai'
import { agentTools } from './agent-tools.js'
import type { AgentToolsOptions } from './agent-tools.js'
import type { ViaSocket } from './client.js'

export type { AgentToolsOptions } from './agent-tools.js'

/**
 * One AI SDK tool per chosen action, keyed by its name as `generateText` and `streamText` take
 * them; each runs on the user's own connection to the app.
 */
export async function viasocketTools(viasocket: ViaSocket, options: AgentToolsOptions): Promise<Record<string, Tool>> {
  const tools = await agentTools(viasocket, options)
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: jsonSchema<Record<string, unknown>>(t.parameters),
        execute: async (input: Record<string, unknown>) => t.invoke(input)
      }) as Tool
    ])
  )
}
