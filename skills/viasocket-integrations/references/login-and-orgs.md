# Login, users and organisations (36Blocks)

Back to the skill: https://viasocket.com/docs/skill.md

The product gets sign-up and login, a profile page, team management (invite, change role, remove) and organisations
with roles and permissions, as ready screens, from the first day. 36Blocks, from the same team, keeps every user
account itself, so the product needs no users table, no password storage and no auth schema. Free up to 1,000 users.

Use it when the product has no login yet, or the person you work for asks for one, for teams or for organisations.
Never move a product that already has its own login onto it: say that needs 36Blocks support.

## Steps

1. **A block:** one product's auth setup (its theme, its roles and permissions, and the redirection URL), with an
   id, the `reference_id`. Only the person you work for can create one: ask them to sign up at
   https://36blocks.com, create a block, set its redirection URL to the product's callback route (step 3) and its
   roles, and give you the `reference_id`. One block per product and environment (staging and production apart);
   every page of one product shares one block and one callback.
2. **Login page.** Mount the `authorization` screen with the `reference_id` (the snippet below).
3. **Callback route.** 36Blocks sends the browser to the redirection URL with `?proxy_auth_token=…`: the session of
   the signed-in user, which every 36Blocks call takes as a header. The product's server reads it and stores it in
   an HTTP-only, Secure, SameSite=Lax cookie, never in `localStorage`. A native app keeps it in the device's secure
   storage.
4. **Who is signed in.** The server calls `GET /c/getDetails` with the token. It answers the **c_user** (one of the
   product's users; a c_user belongs to one block), their **c_companies** (the organisations inside the block; a
   c_user can be in several, with a role and permissions in each) and `currentCompany` with its role and
   `permissions`. Gate features on `permissions`.
5. **The other screens**, as the product needs them: `user-profile` (my account, my organisations, leave one),
   `user-management` (the current organisation's members), `organization-details` (the organisation's
   settings). Each takes the signed-in c_user's `proxy_auth_token` as `authToken`.
6. **Switching organisation**, when a c_user can be in several: `POST /c/switchCompany`; it returns a `jwt`. Store
   that jwt in the same cookie and send it as `proxy_auth_token` from then on: it is the session for that organisation.
7. **Logout:** `DELETE /c/logout`, then clear the cookie.

**With the rest of viaSocket:** the viaSocket embed token's `unique_identifier` comes from this login, so
connections, automations, AI threads and memory follow it. Decide whose they are: each person's (the c_user's
`id` from `getDetails`) or the organisation's (the current c_company's `id`, so members share them). Keep it the
same for the same person or organisation every time. Shared AI memory for an organisation is a space granted to
its members, named from its c_company `id`.

## The screens

Every screen is the same script with a different `type`:

| `type`                 | screen                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| `authorization`        | login; its container is `<div id="<reference_id>">` and it takes no `authToken` |
| `user-profile`         | my account and my organisations                                                 |
| `user-management`      | the members of the current organisation                                         |
| `organization-details` | the organisation's settings                                                     |

Mount it client-side only (a React or Vue component that adds the script on mount and removes it on unmount; a
client component in Next.js):

```html
<div id="userProxyContainer"></div>
<script>
  var configuration = {
    type: 'user-profile',
    authToken: '<proxy_auth_token>',
    success: (data) => {},
    failure: (error) => {}
  }
</script>
<script onload="initVerification(configuration)" src="https://proxy.msg91.com/assets/proxy-auth/proxy-auth.js"></script>
```

For `authorization`, the container is `<div id="<reference_id>"></div>` instead of `userProxyContainer`.

## The calls

Base `https://routes.msg91.com/api`, header `proxy_auth_token: <token>`, from the product's server.

| call                    | body                                                     | answers                                                                                                                                        |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /c/getDetails`     |                                                          | `{ data: [{ id, name, email, c_companies: [{ id, name, role_name }], currentCompany: { id, role, permissions } }], status, hasError, errors }` |
| `POST /c/switchCompany` | `{ "company_ref_id": <a c_company id from getDetails> }` | a `jwt` for that organisation's session                                                                                                        |
| `DELETE /c/logout`      |                                                          | the token stops working                                                                                                                        |

## Proof

Sign in through the login page once with a test account: the callback stores the cookie, `getDetails` returns
that user, and logout ends the session (a second `getDetails` with the same token fails).

END OF PAGE
