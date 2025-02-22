'use strict';

const x7tv = {
  scale: ({ 2: '2', 3: '4' })[opt.get ('scale')] ?? '1',
  emoteStyle: opt.has ('static') ? '_static' : '',
  format: opt.has ('7tv', 'webp') ? 'webp' : 'avif',
  ws: new ReconnectingWebSocket ('wss://events.7tv.io/v3', null,
                                 { automaticOpen: false }),
  emoteCode: {},
  activeSet: {},
  heartbeat: {},
  op: {
    dispatch:     0,
    hello:        1,
    heartbeat:    2,
    reconnect:    4,
    error:        6,
    endOfStream:  7,
    subscribe:   35,
  },
};

addEventListener ('load', init7tv);

function init7tv ()
{
  if (conf.no['7tv'])
    return;
  x7tv.ws.addEventListener ('open', rejoin7tvRooms);
  x7tv.ws.addEventListener ('message', receive7tv);
  x7tv.ws.open ();
  addEventListener ('beforeunload', () => { x7tv.ws.close (); });
  setInterval (() => {
    if (x7tv.ws.readyState == WebSocket.OPEN &&
        x7tv.heartbeat.latest + 3 * x7tv.heartbeat.interval < Date.now ())
      x7tv.ws.reconnect ();
  }, 60000);

  fetch ('https://7tv.io/v3/emote-sets/global')
    .then (response => response.json ())
    .then (json => {
      for (const emote of json.emotes)
        add7tvEmote (emote, conf.emotes.global, 'global');
    })
    .catch (console.error);
}

function rejoin7tvRooms ()
{
  for (const rid of conf.joinedRooms)
    if (!send7tvJoin (rid))
      break;
}

function send7tvJoin (rid)
{
  try
  {
    const obj = {
      op: x7tv.op.subscribe,
      d: {
        type: 'emote_set.update',
        condition: { object_id: x7tv.activeSet[rid] }
      }
    };
    x7tv.ws.send (JSON.stringify (obj));
    return true;
  }
  catch
  {
    return false;
  }
}

function receive7tv (event)
{
  const json = JSON.parse (event.data);
  switch (json.op)
  {
    case x7tv.op.dispatch:
      dispatch7tv (json.d);
      break;

    case x7tv.op.hello:
      x7tv.heartbeat.interval = json.d.heartbeat_interval;
      // fall through
    case x7tv.op.heartbeat:
      x7tv.heartbeat.latest = json.t;
      break;

    case x7tv.op.reconnect:
    case x7tv.op.error:
    case x7tv.op.endOfStream:
      console.debug (json);
      x7tv.ws.reconnect ();
      break;
  }
}

function dispatch7tv ({ type, body })
{
  console.debug ({ type, body });
  switch (type)
  {
    case 'emote_set.update':
      for (const rid of x7tv.activeSet)
        if (x7tv.activeSet[rid] == body.id)
        {
          for (const { old_value } of body.pulled ?? [])
          {
            if (conf.emotes.room[rid]?.[old_value.name]?.source[0] == '7tv')
              delete conf.emotes.room[rid][old_value.name];
            display7tvAction (rid, 'emote-delete', body.actor.display_name,
                              `removed emote ${old_value.name}.`);
          }
          for (const { old_value, value } of body.updated ?? [])
          {
            if (conf.emotes.room[rid]?.[old_value.name]?.source[0] == '7tv')
            {
              conf.emotes.room[rid][value.name] =
                conf.emotes.room[rid][old_value.name];
              delete conf.emotes.room[rid][old_value.name];
            }
            else
              add7tvEmote (emote, conf.emotes.room[rid], 'room');
            display7tvAction (rid, 'emote-rename', body.actor.display_name,
                              `renamed emote ${old_value.name}` +
                              ` -> ${value.name}.`);
          }
          for (const { value } of body.pushed ?? [])
          {
            conf.emotes.room[rid] ??= { __proto__: null };
            add7tvEmote (emote, conf.emotes.room[rid], 'room');
            display7tvAction (rid, 'emote-add', body.actor.display_name,
                              `added emote ${value.name}.`);
          }
        }
      break;
  }
}

function display7tvAction (rid, command, actor, action)
{
  displayChat ({ tags: { 'display-name': actor },
                 source: '7tv.app',
                 command,
                 params: [ conf.badges.room[rid].channel, action ] });
}

function display7tvAction (rid, command, actor, action)
{
  displayChat ({ tags: { 'display-name': actor },
                 source: '7tv.app',
                 command,
                 params: [ conf.badges.room[rid].channel, action ] });
}

if (!conf.no['7tv'])
  conf.onJoinRoom.push (join7tvRoom);

async function join7tvRoom (rid)
{
  const response = await fetch (`https://7tv.io/v3/users/twitch/${rid}`);
  if (response.status == 404)
    return;
  const json = await response.json ();
  if (!conf.badges.room[rid].channel)
    conf.badges.room[rid].channel = `#${json.username}`;
  x7tv.activeSet[rid] = json.emote_set.id;
  send7tvJoin (rid);
  conf.emotes.room[rid] ??= { __proto__: null };
  for (const emote of json.emote_set.emotes)
    add7tvEmote (emote, conf.emotes.room[rid], 'room');
}

function add7tvEmote ({ id, name, flags, data }, dest, scope)
{
  const emote = {
    code: name,
    source: [ '7tv', scope ]
  };
  if (flags & 1)
    emote.style = [ 'overlay' ];
  const s = data.animated ? x7tv.emoteStyle : '';
  emote.url = `https:${data.host.url}/${x7tv.scale}x${s}.${x7tv.format}`;
  dest[emote.code] = emote;
  x7tv.emoteCode[id] = emote.code;
}
