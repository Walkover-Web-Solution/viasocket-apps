/**
 * viasocket-apps — server-side client for the viaSocket Apps API.
 *
 *   import { ViaSocket } from 'viasocket-apps'
 *
 *   const viasocket = new ViaSocket({ orgId, projectId, secret: process.env.VIASOCKET_EMBED_SECRET })
 *   const user = viasocket.user(uniqueIdentifier)
 *
 *   const token = await user.token()                                  // for the connect popup
 *   const serviceId = await viasocket.catalog.serviceIdFor('slack')    // an app, by its slug
 *   const actionVersionId = await viasocket.catalog.versionIdFor(serviceId, 'row1jrbor', 'V107')
 *   const { scriptId } = await user.enable(serviceId, authId)          // once, for actions
 *   const { options } = await user.listOptions(actionVersionId, {...}) // fill a dropdown
 *   const result = await viasocket.runAction(scriptId, actionVersionId, inputData)
 *   const sub = await user.subscribe(triggerVersionId, { authId, inputData, code: handler })
 *   const reply = await user.ai.send({ threadId, message, prompt, tools })  // a chat assistant we run for this user
 *
 * The browser half — opening the connect popup — lives at 'viasocket-apps/browser'.
 */

export { ViaSocket, UserScope, BUILT_IN_PLUG_CATEGORIES } from './client.js'
export { ViaSocketError } from './errors.js'
export { signEmbedToken } from './token.js'
export { agentTools, actionInputSchema } from './agent-tools.js'
export type { AgentTool, AgentToolsOptions, JsonSchema } from './agent-tools.js'
export type {
  McpLogin,
  McpPrompt,
  McpServerDefinition,
  McpServerIds,
  McpServerSummary,
  McpSkill,
  McpSyncResult,
  McpToken,
  McpTool,
  McpToolApi
} from './mcp.js'
export type { SignEmbedTokenInput } from './token.js'
export type {
  AiAccepted,
  AiHistoryPage,
  AiMcpServer,
  AiMessage,
  AiReply,
  AiRtLayerToken,
  AiSend,
  AiSendParams,
  AiThread,
  AiTool,
  BuiltInApp,
  CatalogApp,
  CatalogAction,
  CatalogService,
  CatalogTrigger,
  CatalogVersion,
  CatalogVersions,
  EnableResult,
  Envelope,
  Flow,
  FlowStatus,
  ListAppsParams,
  ListOptionsParams,
  ListOptionsResult,
  LoginCompany,
  LoginUser,
  MemoryAccess,
  MemoryToken,
  Option,
  RenameFlowParams,
  SubscribeParams,
  SubscribeResult,
  UpdateSubscriptionParams,
  UserOptions,
  ViaSocketOptions
} from './types.js'
