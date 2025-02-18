'use strict';

const bttv = {
  emoteStyle: opt.has ('static') ? 'static/' : '',
  ws: new ReconnectingWebSocket ('wss://sockets.betterttv.net/ws', null,
                                 { automaticOpen: false }),
  emoteCode: {},
  special: {
    __proto__: null,
    'c!': [ 'prefix', 'cursed' ],
    'h!': [ 'prefix', 'flip-x' ],
    'l!': [ 'prefix', 'rotate-l' ],
    'p!': [ 'prefix', 'party' ],
    'r!': [ 'prefix', 'rotate-r' ],
    's!': [ 'prefix', 'shake' ],
    'v!': [ 'prefix', 'flip-y' ],
    'w!': [ 'prefix', 'grow-x' ],
    'z!': [ 'prefix', 'no-space' ],
    CandyCane: [ 'overlay' ],
    IceCold:   [ 'overlay' ],
    ReinDeer:  [ 'overlay' ],
    SantaHat:  [ 'overlay' ],
    SoSnowy:   [ 'overlay' ],
    TopHat:    [ 'overlay' ],
    cvHazmat:  [ 'overlay' ],
    cvMask:    [ 'overlay' ],
  },
};

addEventListener ('load', initBttv);

function initBttv ()
{
  if (conf.no.bttv)
    return;
  bttv.ws.addEventListener ('open', rejoinBttvRooms);
  bttv.ws.addEventListener ('message', receiveBttv);
  bttv.ws.open ();
  addEventListener ('beforeunload', () => { bttv.ws.close (); });

  fetch ('https://api.betterttv.net/3/cached/emotes/global')
    .then (response => response.json ())
    .then (json => {
      for (const emote of json)
        addBttvEmote (emote, conf.emotes.global, 'global');
    })
    .catch (console.error);
  fetch ('https://api.betterttv.net/3/cached/badges/twitch')
    .then (response => response.json ())
    .then (json => {
      for (const { providerId: uid, badge: { type, svg } } of json)
        (conf.badges.user[uid] ??= {})[`bttv/${type}`] = svg;
    })
    .catch (console.error);
}

function rejoinBttvRooms ()
{
  for (const rid of conf.joinedRooms)
    if (!sendBttvJoin (rid))
      break;
}

function sendBttvJoin (rid)
{
  try
  {
    const obj = { name: 'join_channel', data: { name: `twitch:${rid}` } };
    bttv.ws.send (JSON.stringify (obj));
    return true;
  }
  catch
  {
    return false;
  }
}

function receiveBttv (event)
{
  const json = JSON.parse (event.data);
  const rid = json.data.channel.replace (/^twitch:/, '');
  const emote = json.data.emote;
  const old = bttv.emoteCode[emote?.id ?? json.data.emoteId];
  switch (json.name)
  {
    case 'emote_create':
      conf.emotes.room[rid] ??= { __proto__: null };
      addBttvEmote (emote, conf.emotes.room[rid], 'room');
      displayBttvAction (rid, json.name, `added emote ${emote.code}.`);
      break;

    case 'emote_update':
      bttv.emoteCode[emote.id] = emote.code;
      if (conf.emotes.room[rid]?.[old]?.source[0] == 'bttv')
      {
        conf.emotes.room[rid][emote.code] = conf.emotes.room[rid][old];
        delete conf.emotes.room[rid][old];
      }
      else
        addBttvEmote (emote, conf.emotes.room[rid], 'room');
      displayBttvAction (rid, json.name,
                         `renamed emote ${old} -> ${emote.code}.`);
      break;

    case 'emote_delete':
      delete bttv.emoteCode[json.data.emoteId];
      if (conf.emotes.room[rid]?.[old]?.source[0] == 'bttv')
        delete conf.emotes.room[rid][old];
      displayBttvAction (rid, json.name, `removed emote ${old}.`);
      break;

    case 'lookup_user':
      updateBttvUser (json.data);
      break;
  }
}

function displayBttvAction (rid, command, action)
{
  displayChat ({ tags: {},
                 source: 'betterttv.com',
                 command,
                 params: [ conf.badges.room[rid].channel, action ] });
}

function updateBttvUser (data)
{
  const uid = data.providerId;
  console.debug (conf.chat.querySelector (`.chat-line[data-user-id="${uid}"]`));
  console.debug (data);
  if (data.badge)
    (conf.badges.user[uid] ??= {})['bttv/pro'] = data.badge.url;
  else
    delete conf.badges.user[uid]?.['bttv/pro'];
  if (data.pro)
  {
    conf.emotes.user[uid] ??= { __proto__: null };
    for (const emote of data.emotes)
      addBttvEmote (emote, conf.emotes.user[uid], 'personal');
  }
  else if (conf.emotes.user[uid])
    for (const emote of conf.emotes.user[uid])
      if (emote.source[0] == 'bttv')
        delete conf.emotes.user[uid][emote];
  if (data.glow)
    (conf.cosmetics[uid] ??= []).push ('glow');
}

if (!conf.no.bttv)
  conf.onJoinRoom.push (joinBttvRoom);

async function joinBttvRoom (rid)
{
  sendBttvJoin (rid);
  const response = await
    fetch (`https://api.betterttv.net/3/cached/users/twitch/${rid}`);
  const json = await response.json ();
  // TODO give json.bots the https://cdn.betterttv.net/tags/bot.png badge
  // problem: usernames instead of ids, no scaled badges
  conf.emotes.room[rid] ??= { __proto__: null };
  for (const emote of json.channelEmotes)
    addBttvEmote (emote, conf.emotes.room[rid], 'room');
  for (const emote of json.sharedEmotes)
    addBttvEmote (emote, conf.emotes.room[rid], 'room');
}

function addBttvEmote ({ id, code }, dest, scope)
{
  const emote = {
    id,
    code,
    source: [ 'bttv', scope ]
  };
  if (bttv.special[code])
    emote.style = bttv.special[emote.code];
  emote.url = 'https://cdn.betterttv.net/emote/' +
    `${id}/${bttv.emoteStyle}${conf.emoteScale}x.webp`;
  dest[code] = emote;
  bttv.emoteCode[id] = code;
}
