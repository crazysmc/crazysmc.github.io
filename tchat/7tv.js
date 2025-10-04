'use strict';

const x7tv = {
  scale: ({ 2: '2', 3: '4' })[opt.get ('scale')] ?? '1',
  emoteStyle: opt.has ('static') ? '_static' : '',
  format: opt.has ('7tv', 'webp') ? 'webp' : 'avif',
  ws: new ReconnectingWebSocket ('wss://events.7tv.io/v3', null,
                                 { automaticOpen: false }),
  user: {},
  personal: {},
  badges: {},
  heartbeat: {},
  op: {
    dispatch:     0,
    hello:        1,
    heartbeat:    2,
    reconnect:    4,
    error:        6,
    endOfStream:  7,
    subscribe:   35,
    unsubscribe: 36,
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
      x7tv.ws.refresh ();
  }, 60000);
  const style = document.createElement ('style');
  document.head.append (style);
  x7tv.css = style.sheet;

  fetch ('https://7tv.io/v3/emote-sets/global')
    .then (response => response.json ())
    .then (json => {
      for (const emote of json.emotes)
        add7tvEmote (emote, conf.emotes.global, 'global');
    })
    .catch (e => displayError ('Failed to load global 7TV emotes', e));
}

function rejoin7tvRooms ()
{
  for (const rid of conf.joinedRooms)
    if (!send7tvJoin (rid))
      break;
}

function send7tvJoin (rid)
{
  const condition = { platform: 'TWITCH', ctx: 'channel', id: rid };
  const ds = [
    { type: 'cosmetic.create', condition },
    { type: 'emote_set.*',     condition },
    { type: 'entitlement.*',   condition },
    { type: 'user.update',
      condition: { object_id: x7tv.user[rid].id } },
    { type: 'emote_set.update',
      condition: { object_id: x7tv.user[rid].set } },
  ];
  try
  {
    for (const d of ds)
      x7tv.ws.send (JSON.stringify ({ op: x7tv.op.subscribe, d }));
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
      x7tv.ws.refresh ();
      break;
  }
}

function dispatch7tv ({ type, body })
{
  const { kind, id, data, ref_id, user } = body.object ?? {};
  const uid = user?.connections
    ?.find (x => x.platform == 'TWITCH')
    ?.id;
  switch (type)
  {
    case 'emote_set.update':
      for (const rid in x7tv.user)
        if (x7tv.user[rid].set == body.id)
        {
          for (const { old_value } of body.pulled ?? [])
          {
            if (conf.emotes.room[rid]?.[old_value.name]?.source[0] == '7tv')
              delete conf.emotes.room[rid][old_value.name];
            display7tvAction (rid, 'delete', body.actor.display_name,
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
              add7tvEmote (value, conf.emotes.room[rid], 'room');
            display7tvAction (rid, 'rename', body.actor.display_name,
                              `renamed emote ${old_value.name}` +
                              ` -> ${value.name}.`);
          }
          for (const { value } of body.pushed ?? [])
          {
            conf.emotes.room[rid] ??= { __proto__: null };
            add7tvEmote (value, conf.emotes.room[rid], 'room');
            display7tvAction (rid, 'add', body.actor.display_name,
                              `added emote ${value.name}.`);
          }
        }
      if (x7tv.personal[body.id] && body.pushed)
        x7tv.personal[body.id].push (...body.pushed.map (x => x.value));
      break;

    case 'user.update':
      const rid = x7tv.user[body.id].rid;
      for (const { key, index, value: conns } of body.updated ?? [])
        if (key == 'connections' && index == x7tv.user[rid].conn)
          for (const { key, old_value, value } of conns ?? [])
            if (key == 'emote_set')
            {
              const type = 'emote_set.update';
              const d = { type, condition: { object_id: old_value.id } };
              x7tv.ws.send (JSON.stringify ({ op: x7tv.op.unsubscribe, d }));
              d.condition.object_id = value.id;
              x7tv.ws.send (JSON.stringify ({ op: x7tv.op.subscribe, d }));
              for (const code in conf.emotes.room[rid])
                if (conf.emotes.room[rid][code].source[0] == '7tv')
                  delete conf.emotes.room[rid][code];
              load7tvEmoteSet (rid, value.id);
              display7tvAction (rid, 'set-swap',
                                body.actor.display_name,
                                `switched emote set ${old_value.name}` +
                                ` -> ${value.name}.`);
            }
      break;

    case 'cosmetic.create':
      switch (kind)
      {
        case 'PAINT':
          const rule = `.nick.paint-${id} { ${cssFor7tvPaint (data)} }`;
          x7tv.css.insertRule (rule, x7tv.css.cssRules.length);
          break;

        case 'BADGE':
          x7tv.badges[id] = data;
          break;
      }
      break;

    case 'emote_set.create':
      x7tv.personal[id] = [];
      break;

    case 'entitlement.create':
      switch (kind)
      {
        case 'EMOTE_SET':
          conf.emotes.user[uid] ??= { __proto__: null };
          for (const emote of x7tv.personal[ref_id] ?? [])
            add7tvEmote (emote, conf.emotes.user[uid], 'personal');
          break;

        case 'PAINT':
          (conf.cosmetics[uid] ??= []).push ('paint', `paint-${ref_id}`);
          conf.chat.querySelector (`.chat-line[data-user-id="${uid}"] .nick`)
            ?.classList.add ('paint', `paint-${ref_id}`);
          break;

        case 'BADGE':
          const { host, tag } = x7tv.badges[ref_id];
          const s = host.files.some (x => x.frame_count > 1)
            ? x7tv.emoteStyle
            : '';
          const url = `https:${host.url}/${x7tv.scale}x${s}.${x7tv.format}`;
          (conf.badges.user[uid] ??= {})[`7tv/${tag}`] = url;
          const badges = (conf.chat.querySelector
                          (`.chat-line[data-user-id="${uid}"] .badges`));
          if (badges && !badges.querySelector (`img[alt="[7tv/${tag}]"]`))
          {
            const img = document.createElement ('img');
            img.src = url;
            img.alt = `[7tv/${tag}]`;
            const pronouns = badges.querySelector ('.pronouns');
            if (pronouns)
              pronouns.before (img);
            else
              badges.append (img);
            badges.classList.remove ('hidden');
          }
          break;
      }
      break;

    case 'entitlement.delete':
      switch (kind)
      {
        case 'EMOTE_SET':
          for (const emote of x7tv.personal[ref_id])
            if (conf.emotes.user[uid][emote.name].source[0] == '7tv')
              delete conf.emotes.user[uid][emote.name];
          break;

        case 'PAINT':
          conf.cosmetics[uid] = conf.cosmetics[uid]
            .filter (x => x != `paint-${ref_id}`);
          if (!conf.cosmetics[uid].some (x => x.startsWith ('paint-')))
            conf.cosmetics[uid] = conf.cosmetics[uid]
              .filter (x => x != 'paint');
          break;

        case 'BADGE':
          const { tag } = x7tv.badges[ref_id];
          delete conf.badges.user[uid][`7tv/${tag}`];
          break;
      }
      break;
  }
}

function display7tvAction (rid, code, actor, action)
{
  displayChat ({ tags: { emote: code, 'display-name': actor },
                 source: '7tv.app',
                 command: 'emote-notice',
                 params: [ conf.badges.room[rid].channel, action ] });
}

function cssFor7tvPaint (data)
{
  const {
    color,
    shadows,
    'function': fun,
    repeat,
    angle,
    shape,
    image_url,
    stops,
  } = data;
  let css = '';
  if (color)
    css += `color: #${num2hex (color)};`;
  const rep = repeat ? 'repeating-' : '';
  const list = stops
    .map (({ color, at }) =>  `#${num2hex (color)} ${at * 100}%`)
    .join (', ');
  switch (fun)
  {
    case 'LINEAR_GRADIENT':
      css += `background-image: ${rep}linear-gradient(${angle}deg, ${list});`;
      break;
    case 'RADIAL_GRADIENT':
      css += `background-image: ${rep}radial-gradient(${shape}, ${list});`;
      break;
    case 'URL':
      const s = opt.has ('static')
        ? `url(${image_url.replace (/x(\.\w+)$/, 'x_static$1')}), `
        : '';
      css += `background-image: ${s}url(${image_url});`;
      break;
  }
  const filter = shadows
    .map (({ x_offset, y_offset, radius, color }) => {
      const x = x_offset * 0.06;
      const y = y_offset * 0.06;
      const r = radius   * 0.06;
      return `drop-shadow(${x}em ${y}em ${r}em #${num2hex (color)})`;
    })
    .join (' ');
  if (filter)
    css += `filter: ${filter};`;
  return css;
}

function num2hex (num)
{
  return (num >>> 0)
    .toString (16)
    .padStart (8, '0');
}

async function load7tvEmoteSet (rid, set)
{
  try
  {
    const response = await fetch (`https://7tv.io/v3/emote-sets/${set}`);
    if (response.status == 404)
      return;
    const json = await response.json ();
    x7tv.user[rid].set = set;
    conf.emotes.room[rid] ??= { __proto__: null };
    for (const emote of json.emotes)
      add7tvEmote (emote, conf.emotes.room[rid], 'room');
  }
  catch (e)
  {
    displayError ('Failed to load 7TV emote set', e);
  }
}

if (!conf.no['7tv'])
{
  conf.onJoinRoom.push (join7tvRoom);
  conf.reloadCmds['7tv'] = join7tvRoom;
}

async function join7tvRoom (rid)
{
  try
  {
    const response = await fetch (`https://7tv.io/v3/users/twitch/${rid}`);
    if (response.status == 404)
      return;
    const json = await response.json ();
    const conn = json.user.connections
      .findIndex (x => x.platform == 'TWITCH');
    x7tv.user[rid] = {
      id: json.user.id,
      conn,
      set: json.emote_set_id,
    };
    x7tv.user[json.user.id] = { rid };
    send7tvJoin (rid);
    if (json.user.avatar_url?.startsWith ('//cdn.7tv.app/'))
      conf.badges.room[rid].avatar = 'https:' + json.user.avatar_url
        .replace (/\/3x(_static)?\.(avif|webp)$/,
                  `/${x7tv.scale}x${x7tv.emoteStyle}.${x7tv.format}`);
    conf.emotes.room[rid] ??= { __proto__: null };
    for (const emote of json.emote_set?.emotes ?? [])
      add7tvEmote (emote, conf.emotes.room[rid], 'room');
  }
  catch (e)
  {
    displayError ('Failed to load channel 7TV emotes', e);
  }
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
  conf.preload.push (emote.url);
  dest[emote.code] = emote;
}
