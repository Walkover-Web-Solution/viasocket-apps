/**
 * viasocket-apps — server-side client for the viaSocket Apps API.
 *
 *   import { ViaSocket } from 'viasocket-apps'
 *
 *   const viasocket = new ViaSocket({ orgId, projectId, secret: process.env.VIASOCKET_EMBED_SECRET })
 *   const user = viasocket.user(uniqueIdentifier)
 *
 *   const token = await user.token()                                      // for the connect popup
 *   const { serviceId, actions } = await user.listActions('slack')         // an app by its slug: its keys and versions
 *   const { scriptId } = await user.enable('slack', authId)                // once, for actions
 *   const { options } = await user.listOptions('slack', 'Send_Message', { fieldKey, authId, search })  // fill a dropdown
 *   const result = await viasocket.runAction(scriptId, 'Send_Message', inputData, { version: 'v107' })
 *   const sub = await user.subscribe('slack', 'New_Message', { authId, inputData, code: handler })
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
  AiAttachment,
  AiHistoryPage,
  AiMcpServer,
  AiMessage,
  AiReply,
  AiRtLayerToken,
  AiSend,
  AiSendParams,
  AiThread,
  AiTool,
  AppAction,
  AppActions,
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
  ListActionsParams,
  ListAppsParams,
  ListOptionsParams,
  ListOptionsResult,
  LoginCompany,
  LoginUser,
  MemoryAccess,
  MemoryToken,
  Option,
  RenameFlowParams,
  RunActionOptions,
  RunCodeOptions,
  SubscribeParams,
  SubscribeResult,
  UpdateSubscriptionParams,
  UserOptions,
  ViaSocketOptions
} from './types.js'
