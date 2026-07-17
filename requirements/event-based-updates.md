# Server Event Based Updates of the UI

`UIElement`s update themselves in reaction to server events delivered over the
WebSocket. The rule is: **no `UIElement` calls `this.update(true)` from its
own click / input handlers**. Instead, the click sends a request to the server,
the server broadcasts an event to the affected users, and the corresponding
`UIElement`s listen for that event and refresh. This keeps every screen
consistent with what the server actually knows — no optimistic redraws that
have to be reconciled later, and multiple browser tabs / devices for the same
user stay in sync automatically.

## Component contract

Every `UIElement` subclass that participates:

1. Declares its subscriptions via the `serverEvents` getter. Event names must
   be listed in `client/lib/serverEvents.js`; an unknown name throws on mount.
2. Splits `load(isUpdate)` into an initial branch (may accept partial data
   from the constructor) and an update branch (must refetch everything the
   template renders).
3. Opts into the update indicator with `updateIndicator = true` when it makes
   sense to visually flag a background refresh — a subtle half-opacity pulse
   applied via the `ui-element-updating` CSS class while `load(true)` runs.
   This is distinct from the initial `showLoadingIndicator` (bouncing ball),
   which is only shown on the first mount before the first render.

Handlers stay registered for the entire DOM lifetime of the element. They
fire even while the element is not visible (e.g. a page is scrolled off, a
tab is inactive) as long as the element is still mounted; when the router
tears the element down, the handlers are unregistered automatically.

## Central event registry

`client/lib/serverEvents.js` is the single source of truth for both sender
(`sendToUser`, `sendToTeam`) and subscriber (`UIElement.serverEvents`). It
lives inside `client/` so it ships with the browser and native-app bundles
without extra plumbing; the server imports it via the same cross-package
pattern used for `client/util/formation.js`. Both sides call
`assertKnownServerEvent(name, context)` — a typo or a renamed/removed event
fails loudly instead of silently missing every notification.

## Ensuring events reach only the right users

Server-side, events are sent per user (`sendToUser(userId, ...)`) or per
team (`sendToTeam(teamId, ...)`, which resolves the team's user). Whenever a
handler on the server mutates state that only concerns a single user's UI,
it must use these targeted sends — never broadcast to `wss.clients`. For
foreign-team views (e.g. a `PlayerList` opened for someone else's squad) the
current server does not yet cross-notify: viewers of another user's team
will not see live updates when that user lists a player. That is acceptable
for now; adding cross-user notifications is a separate, explicit change.

## UIElement / event mapping

| UIElement                             | Server event(s)                | Behavior                                                                    |
|---------------------------------------|--------------------------------|-----------------------------------------------------------------------------|
| `PlayerListItem`                      | `NEW_SELL_TRADE_OFFER`, `REMOVE_SELL_TRADE_OFFER`, `CAPTAIN_CHANGED`, `BENCH_CHANGED` | Filters by `data.playerId === this.player.id`, adds / removes the sell-offer icon; toggles the (C) marker when this row is the outgoing or incoming captain; flips the row highlight (warning / neutral) when the player is added to or displaced from a bench slot. |
| `PlayerList`                          | *(none — delegates to items)*  | List-shape changes (fire, hire, transfer completed) will use dedicated events once introduced. |
| `SquadPlayer` (lineup tile)           | `CAPTAIN_CHANGED`, `BENCH_CHANGED` | Only the outgoing and incoming captain tiles re-render — the other nine tiles stay untouched, so the pitch doesn't flicker. On a bench pick that vacates the tile's slot, the tile turns into a fake placeholder in place. |
| `Lineup`                              | `CAPTAIN_CHANGED`, `BENCH_CHANGED` | Keeps its shared `team.captain_id` ref in sync and reconciles `this.players` (marks the picked player as benched, drops in a fake for the vacated slot) so the click handler stays correct. Does *not* re-render itself. |
| `BenchSlot` (one per position)        | `BENCH_CHANGED`                | Swaps its own occupant in place when the event targets this slot, or clears itself when its current player is moved to a different slot. Sibling slots stay untouched (no image reloads). |
| `CaptainSelect`                       | `CAPTAIN_CHANGED`, `BENCH_CHANGED` | Flips the selected `<option>` on captain changes and refreshes the option list on any bench pick that vacates a lineup slot (the demoted player must disappear from the candidate list). |
| `ATeamPage`                           | `BENCH_CHANGED`                | Mutates the page's `parent.data.players` in place so a subsequent full re-render (formation change, tab switch) sees the latest bench / lineup assignments. |
| `GameLayout` / `NativeAppLayout`      | `NEW_LOG_MESSAGE`, `BUY_OFFER_ACCEPTED`, `BUY_OFFER_REJECTED` | Bumps the log-messages badge; toasts trade-offer outcomes. |
| `Balance` (partial)                   | `BALANCE_UPDATED`              | Updates the header cash figure. Legacy consumer, not migrated in this PR.   |
| `MyOffersPage`                        | `BUY_OFFER_ACCEPTED`, `BUY_OFFER_REJECTED` | Refreshes the answered-offers table. Legacy consumer.            |
| `MyTeamPage`                          | `PLAYER_SOLD`                  | Refreshes squad after a sale. Legacy consumer.                              |
| `TutorialProgress`                    | `TUTORIAL_COMPLETED`           | Hides progress widget. Legacy consumer.                                     |
| `Balance` / `MyOffersPage` (indirect) | `RECONNECTED`                  | Client-only signal fired after a websocket reconnect so consumers can refetch. |

Legacy consumers still use the pre-refactor pattern (their own `update(true)`
inside handlers registered before `updateIndicator` / `load(isUpdate)` were
added). Migrating them is tracked as follow-up work; the base class stays
backward-compatible so they keep working unchanged.

## Adding a new event

1. Add a constant to `SERVER_EVENTS` in `client/lib/serverEvents.js` with a
   one-line `description` covering trigger, receiver, and payload shape.
2. Send it from the server via `sendToUser(userId, SERVER_EVENTS.X.name, payload)`
   or via `addLogMessage(..., eventData)` when it piggy-backs on a log entry.
3. Consume it from a `UIElement` via
   `get serverEvents () { return { [SERVER_EVENTS.X.name]: (data) => this.update(true) } }`
   and split `load(isUpdate)` if the initial and update fetch paths differ.
