/**
 * Automations built from code for one end user: the four Automation API routes under `/automations`,
 * as the automations page (https://viasocket.com/docs/automations.md) names them. The calls go as that
 * user, with the user's own token from `GET /users/register` in the `proxy_auth_token` header; the
 * shapes here are the page's, in this package's casing.
 */

import type { AutomationFlow, AutomationRun, AutomationStep, AutomationTrigger, AutomationTriggerResult } from './types.js'

type Dict = Record<string, unknown>

/** The body `POST /automations/:scriptId/trigger` takes, from the trigger in this package's casing. */
export const triggerBody = (trigger: AutomationTrigger): Dict => {
  switch (trigger.triggerType) {
    case 'webhook': {
      const body: Dict = { triggerType: 'webhook' }
      if (trigger.runOncePerItem !== undefined) body.runOncePerItem = trigger.runOncePerItem
      if (trigger.arrayKey !== undefined) body.arrayKey = trigger.arrayKey
      if (trigger.transformCode !== undefined) body.transformCode = trigger.transformCode
      if (trigger.customResponse !== undefined) body.customResponse = trigger.customResponse
      return body
    }
    case 'cron': {
      const body: Dict = { triggerType: 'cron', cronStatement: trigger.cronStatement }
      if (trigger.timezone !== undefined) body.timezone = trigger.timezone
      return body
    }
    case 'plugin': {
      const body: Dict = { triggerType: 'plugin', trigger_id: trigger.triggerId }
      if (trigger.authId !== undefined) body.auth_id = trigger.authId
      if (trigger.inputData !== undefined) body.inputData = trigger.inputData
      return body
    }
    default:
      throw new Error(`triggerType must be webhook, cron or plugin`)
  }
}

/** The saved trigger as the route answers it, in this package's casing. */
export const toTriggerResult = (data: Dict): AutomationTriggerResult => {
  const out: AutomationTriggerResult = {
    scriptId: String(data.script_id ?? ''),
    status: String(data.status ?? ''),
    triggerType: data.triggerType as AutomationTriggerResult['triggerType']
  }
  if (data.webhook_url !== undefined) out.webhookUrl = String(data.webhook_url)
  if (data.runOncePerItem !== undefined) out.runOncePerItem = Boolean(data.runOncePerItem)
  if (data.arrayKey !== undefined) out.arrayKey = String(data.arrayKey)
  if (data.transformCode !== undefined) out.transformCode = String(data.transformCode)
  if (data.customResponse !== undefined) out.customResponse = String(data.customResponse)
  if (data.cronStatement !== undefined) out.cronStatement = String(data.cronStatement)
  if (data.cron_statement !== undefined) out.schedule = String(data.cron_statement)
  if (data.timezone !== undefined) out.timezone = String(data.timezone)
  if (data.trigger_id !== undefined) out.triggerId = String(data.trigger_id)
  if (data.auth_id !== undefined) out.authId = String(data.auth_id)
  if (data.inputData !== undefined) out.inputData = data.inputData as Dict
  if (data.sampleData !== undefined) out.sampleData = data.sampleData
  return out
}

/** One step as `POST /automations/:scriptId/steps` takes it. */
export const stepBody = (step: AutomationStep): Dict => {
  const body: Dict = {
    stepname: step.stepname,
    code: step.code,
    service_action_functions: (step.serviceActionFunctions ?? []).map((fn) => ({ name: fn.name, auth_id: fn.authId, action_id: fn.actionId }))
  }
  if (step.description !== undefined) body.description = step.description
  return body
}

/** One step as the route answers it. */
const toStep = (step: Dict): AutomationStep => ({
  stepname: String(step.stepname ?? ''),
  code: String(step.code ?? ''),
  serviceActionFunctions: ((step.service_action_functions as Dict[] | undefined) ?? []).map((fn) => ({
    name: String(fn.name ?? ''),
    authId: String(fn.auth_id ?? ''),
    actionId: String(fn.action_id ?? '')
  })),
  ...(step.description !== undefined ? { description: String(step.description) } : {})
})

/** The flow as `GET /automations/:scriptId` (and a steps save) answers it. */
export const toFlow = (data: Dict): AutomationFlow => {
  const trigger = (data.trigger as Dict | undefined) ?? {}
  const out: AutomationFlow = {
    scriptId: String(data.script_id ?? ''),
    title: String(data.title ?? ''),
    status: String(data.status ?? ''),
    trigger: toTriggerResult({ ...trigger, script_id: data.script_id, status: data.status }),
    steps: ((data.steps as Dict[] | undefined) ?? []).map(toStep),
    variables: (data.variables as unknown[] | undefined) ?? [],
    version: String(data.version ?? '')
  }
  if (data.webhook_url_of_flow !== undefined) out.webhookUrl = String(data.webhook_url_of_flow)
  return out
}

/** One run as the history route lists it; the fields a product reads, the rest kept as sent. */
export const toRun = (entry: Dict): AutomationRun => ({
  ...entry,
  flowHitId: String(entry.flowHitId ?? ''),
  status: String(entry.status ?? ''),
  requestTimestamp: String(entry.requestTimestamp ?? ''),
  output: entry.output === undefined ? null : String(entry.output),
  console: (entry.console as Record<string, string> | undefined) ?? {},
  steps: ((entry.stepOrderJsonData as Dict[] | undefined) ?? []).map((step) => ({
    id: String(step.id ?? ''),
    status: Number(step.status ?? 0),
    timeTaken: Number(step.timeTaken ?? 0)
  }))
})
