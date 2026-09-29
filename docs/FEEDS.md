# Feeds

Feeds let outside data drive people: Slack presence, an agent's status,
anything. A feed sends **state**; each person's personality decides how to
act it out. Feeds are data, never code, so a shared world can't run someone
else's script.

## Messages

```jsonc
{
  "id": "ada",              // person id, or an external id mapped via world.feed.ids
  "presence": "here",       // here | away
  "activity": "focus",      // working | focus | meeting | break | idle; null clears
  "room": "meeting",        // room id, for meetings
  "bubble": "📞",           // shown above their head
  "label": "Shipping the release"   // shown in the panel
}
```

Omitted fields are unchanged; `null` clears. Validated by `parseFeedMessage`
(`src/feeds/protocol.ts`), and text is capped at 80 characters.

| Status | Effect |
|---|---|
| `presence: away` | Goes home (or to bed, at night) |
| `presence: here` | Comes to work, whatever the time |
| `activity: working` | At their desk |
| `activity: focus` | At their desk with headphones; interruptions bounce off |
| `activity: meeting` | In `room` (or the room with id `meeting`) until it ends |
| `activity: break` | At work, but anything except the desk |

Only `people` take feeds; `npcs` (family, pets, staff, crews, children) ignore them.

## Transports

In the browser today:

```js
officebit.push({ id: 'ada', activity: 'focus' })
officebit.follow('biscuit')   // select and follow anyone, even pets and crews
frame.contentWindow.postMessage({ type: 'officebit:feed', messages: [/* … */] }, '*')
```

Planned: WebSocket, SSE and polled JSON, plus bridges (Slack, agent runners).
Keep credentials out of shared worlds.
