# Connecting a user's app

Back to the skill: https://viasocket.com/docs/skill.md

Contents: 1. The token endpoint (server); 2. The Connect button (browser); 3. Right after Connect; Rules

A user connects one of their apps once, from the product's own screen, and the product never holds an OAuth or a
token: viaSocket keeps the connection alive. What the product keeps is the `auth_id` the connection answers, one per
user and app, stored on the server. An app without sign-in has no Connect button: its `auth_id` is `NoAuth`.

Every function named here (`findEnabledApp`, `runAction`, …) is defined in https://viasocket.com/docs/apps-api.md:
copy its module once.

## 1. The token endpoint (server)

The browser needs an embed token: signed with `VIASOCKET_EMBED_SECRET` per user, on the server, it is the one value
the browser may hold, for the Connect popup and the prebuilt UI.
`embedToken(userId, { expiresIn: '1h' })` signs it for an hour; without the option it works until the secret changes.
The browser gets it only from here, behind the product's login:

```js
app.get('/api/viasocket/token', requireLogin, async (req, res) => {
  const slugs = String(req.query.apps || '')
    .split(',')
    .filter(Boolean) // ?apps=slack,google-sheets
  const serviceIds = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, await serviceIdFor(req.user.id, slug)])))
  res.json({ token: embedToken(req.user.id, { expiresIn: '1h' }), serviceIds })
})
```

## 2. The Connect button (browser)

It shows the app's icon and name.

```html
<script src="https://flow.viasocket.com/connect.js"></script>
<script type="module">
  const { token, serviceIds } = await fetch('/api/viasocket/token?apps=<app_slug>').then((r) => r.json()) // on page load
  const save = (authId) =>
    fetch('/api/viasocket/connected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: '<app_slug>', authId })
    }) // store per user and app
  button.onclick = () =>
    openViasocketConnection(token, serviceIds['<app_slug>'], {
      filteredActions: ['<action_id or trigger_id>'], // consent asks only these actions' and triggers' scopes: action_id in listActions
      skipActionSelection: true, // with the actions named above, or an authId: straight to the app's sign-in and consent screen; alone it changes nothing
      onSuccess: ({ data }) => save(data.id), // also for a success that lands after the popup was reported closed
      onError: ({ error }) => showError(error?.message)
      // authId: '<auth_id>' reconnects an expired connection in place
    })
</script>
```

The popup opens from the click itself, before any `await`: fetch the token on page load. The call also resolves with
`{ status: 'success' | 'error' | 'closed', … }`; `closed` is not a failure, a success may still follow through
`onSuccess`. The script posts the same results as `message` events on the window, from the page itself
(`event.source === window`); the callbacks need none of that, and a listener that trusts any `message` would also
take a forged one.

## 3. Right after Connect

Some apps need one choice per user before any action makes sense: their site, property, workspace or board. The
pages of its events list them in a **Pickers** section (its last column names an event that lists a key with less needed first). Make that choice part of connecting and store it with the `auth_id`.
The rule and the code: actions-and-events.md, "Once, or per run".

## Rules

- Only `openViasocketConnection` opens the popup: a hand-built
  viasocket URL, `window.open` or an iframe shows "Page not found".
- The browser's token lives an hour (`expiresIn: '1h'`), and the page may stay open longer: a click after that hour
  ends with `status: 'error'` ("Embed token could not be verified"). Fetch the token again before the hour ends (a
  timer, or when the tab becomes visible again), or sign the browser's token for as long as a page stays open.
- An expired connection (`isExpired: true` in the user's connections) is reconnected in place with its `authId`,
  so nothing stored against it changes.
- One user's `auth_id` never serves another user. If the product's end users serve customers of their own, the end
  user connects, never their customer.
- An `auth_id` ends in `_<service_id>` but is one opaque value: never split or build it.
- Code names an app by its slug (`slack`, `google-sheets`), exact and case-sensitive (`ZohoFSM`, not `zohofsm`); some
  slugs look like ids.
- Only the Connect popup and the prebuilt UI (its `open` and `filteredServices`) take a `service_id`: `serviceIdFor(userId, slug)` reads it from the app's
  listing. Every other call takes the slug itself. An unknown slug is a 404 to report, not to retry.
- Never pass an app's display name as a slug, and never pass a `service_id` with anything appended to it.

Next, use the connection: actions-and-events.md.

END OF PAGE
