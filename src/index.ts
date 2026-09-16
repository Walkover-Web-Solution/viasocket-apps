/**
 * viasocket-apps-api — server-side client for the viaSocket Apps API.
 *
 *   import { ViaSocket } from 'viasocket-apps-api'
 *
 *   const viasocket = new ViaSocket({ orgId, projectId, secret: process.env.VIASOCKET_EMBED_SECRET })
 *   const user = viasocket.user(endUserId)
 *
 *   const token = await user.token()                                  // for the connect popup
 *   const { scriptId } = await user.enable(serviceId, authId)          // once, for actions
 *   const { options } = await user.listOptions(actionVersionId, {...}) // fill a dropdown
 *   const result = await viasocket.runAction(scriptId, actionVersionId, inputData)
 *   const sub = await user.subscribe(triggerVersionId, { authId, inputData, webhook })
 *
 * The browser half — opening the connect popup — lives at 'viasocket-apps-api/browser'.
 */

export { ViaSocket, UserScope } from './client.js'
export { ViaSocketError } from './errors.js'
export { signEmbedToken } from './token.js'
export type { SignEmbedTokenInput } from './token.js'
export type {
  EnableResult,
  Envelope,
  Flow,
  FlowStatus,
  ListOptionsParams,
  ListOptionsResult,
  Option,
  SubscribeParams,
  SubscribeResult,
  UpdateSubscriptionParams,
  ViaSocketOptions
} from './types.js'
