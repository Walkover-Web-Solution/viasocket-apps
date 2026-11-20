import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionInputSchema } from '../dist/esm/index.js'

// Gmail's Send_Email, trimmed: the body is an `html` field and required. A tool without it cannot send a mail.
const sendEmail = {
  steps: { root: ['to', 'subject', 'messageBody', 'note'] },
  blocks: {
    to: { type: 'string', label: 'To', required: true },
    subject: { type: 'string', label: 'Subject', required: true },
    messageBody: { type: 'html', label: 'Message Body', required: true },
    note: { type: 'help', help: 'Not an input' }
  }
}

test('every text-like field of the form is a string parameter: html included, help text left out', () => {
  const schema = actionInputSchema(sendEmail)
  assert.deepEqual(Object.keys(schema.properties), ['to', 'subject', 'messageBody'])
  assert.equal(schema.properties.messageBody.type, 'string')
  assert.deepEqual(schema.required, ['to', 'subject', 'messageBody'])
})
