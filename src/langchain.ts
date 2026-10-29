/**
 * viasocket-apps/langchain — the apps a user connected, as LangChain tools.
 *
 *   import { ViaSocket } from 'viasocket-apps'
 *   import { viasocketTools } from 'viasocket-apps/langchain'
 *
 *   const viasocket = new ViaSocket({ orgId, projectId, secret: process.env.VIASOCKET_EMBED_SECRET })
 *   const tools = await viasocketTools(viasocket, { user: 'user_123', apps: ['slack'], actions: { slack: ['send-message'] } })
 *   const agent = createAgent({ model, tools })
 *
 * Needs `@langchain/core` 0.3 or later, which the app already has; nothing else is pulled in.
 */

import { tool } from '@langchain/core/tools'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import { agentTools } from './agent-tools.js'
import type { AgentToolsOptions } from './agent-tools.js'
import type { ViaSocket } from './client.js'

export type { AgentToolsOptions } from './agent-tools.js'

/** One LangChain tool per chosen action; each runs on the user's own connection to the app. */
export async function viasocketTools(viasocket: ViaSocket, options: AgentToolsOptions): Promise<DynamicStructuredTool[]> {
  const tools = await agentTools(viasocket, options)
  return tools.map(
    (t) =>
      tool(async (input: Record<string, unknown>) => t.invoke(input), {
        name: t.name,
        description: t.description,
        schema: t.parameters
      }) as unknown as DynamicStructuredTool
  )
}
