# viaSocket skill · connection setup

> Part of the viaSocket skill: `https://viasocket.com/docs/skill.md`. Every function named here (`findEnabledApp`, `runAction`, …) is defined in
> `https://viasocket.com/docs/apps-api.md`: copy its module once.

**Why:** the user brings their own apps and the product never holds an OAuth or a token; viaSocket keeps the connection alive and the product keeps one `auth_id`.

A user connects one of their apps once, from the product's own screen; the result is an `auth_id`, stored per
user and app on the server. An app without sign-in has no Connect button: its `auth_id` is `NoAuth`.

## 1. The token endpoint (server)

The browser gets its embed token only from here, behind the product's login:

```js
app.get('/api/viasocket/token', requireLogin, async (req, res) => {
  const slugs = String(req.query.apps || '')
    .split(',')
    .filter(Boolean) // ?apps=slack,google-sheets
  const serviceIds = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [slug, await serviceIdFor(req.user.id, slug)])))
  res.json({ token: embedToken(req.user.id), serviceIds })
})
```

## 2. The Connect button (browser)

It shows the app's icon and name.

```html
<script src="https://flow.viasocket.com/connect.js"></script>
<script type="module">
  const { token, serviceIds } = await fetch('/api/viasocket/token?apps=<app_slug>').then((r) => r.json()) // on page load
  button.onclick = () =>
    openViasocketConnection(token, serviceIds['<app_slug>'], {
      filteredActions: ['<action_id or trigger_id>'], // consent asks only these actions' and triggers' scopes: action_id in listActions
      skipActionSelection: true
      // authId: '<auth_id>' reconnects an expired connection in place
    })
  window.addEventListener('message', async (event) => {
    // one listener per page: ignore other apps' messages
    if (event.data?.serviceId && event.data.serviceId !== serviceIds['<app_slug>']) return
    if (event.data?.type === 'viasocket_connection_success') {
      await fetch('/api/viasocket/connected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: '<app_slug>', authId: event.data.data.id })
      }) // store per user and app
    } else if (event.data?.type === 'viasocket_connection_error') showError(event.data.error?.message)
    // 'viasocket_connection_closed' is not a failure: a success may still follow
  })
</script>
```

The popup opens from the click itself, before any `await`: fetch the token on page load.

## Rules

- Only `openViasocketConnection` opens the popup: a hand-built
  viasocket URL, `window.open` or an iframe shows "Page not found".
- An expired connection (`isExpired: true` in the user's connections) is reconnected in place with its `authId`,
  so nothing stored against it changes.
- One user's `auth_id` never serves another user. If the product's end users serve customers of their own, the end
  user connects, never their customer.
- An `auth_id` ends in `_<service_id>` but is one opaque value: never split or build it.
- Code names an app by its slug (`slack`, `google-sheets`), exact and case-sensitive (`ZohoFSM`, not `zohofsm`); some
  slugs look like ids.
- Only the Connect popup takes a `service_id`: `serviceIdFor(userId, slug)` reads it from the app's
  listing. Every other call takes the slug itself. An unknown slug is a 404 to report, not to retry.
- Never pass an app's display name as a slug, and never pass a `service_id` with anything appended to it.

## 3. Right after Connect

Some apps need one choice per user before any action makes sense: their site, property, workspace or board. The
app's page lists them in its **Pickers** table. Make that choice part of connecting and store it with the `auth_id`.
The rule and the code: actions-and-events.md, "Once, or per run".

Next, use the connection: actions-and-events.md.

END OF PAGE
