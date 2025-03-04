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
    .catch (e => displayError ('Failed to load global BTTV emotes', e));
  fetch ('https://api.betterttv.net/3/cached/badges/twitch')
    .then (response => response.json ())
    .then (json => {
      for (const { providerId: uid, badge: { type, svg } } of json)
        (conf.badges.user[uid] ??= {})[`bttv/${type}`] = svg;
    })
    .catch (e => displayError ('Failed to load global BTTV badges', e));
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
      displayBttvAction (rid, 'add', `added emote ${emote.code}.`);
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
      displayBttvAction (rid, 'rename',
                         `renamed emote ${old} -> ${emote.code}.`);
      break;

    case 'emote_delete':
      delete bttv.emoteCode[json.data.emoteId];
      if (conf.emotes.room[rid]?.[old]?.source[0] == 'bttv')
        delete conf.emotes.room[rid][old];
      displayBttvAction (rid, 'delete', `removed emote ${old}.`);
      break;

    case 'lookup_user':
      updateBttvUser (json.data);
      break;
  }
}

function displayBttvAction (rid, code, action)
{
  displayChat ({ tags: { emote: code },
                 source: 'betterttv.com',
                 command: 'emote-notice',
                 params: [ conf.badges.room[rid].channel, action ] });
}

function updateBttvUser (data)
{
  const uid = data.providerId;
  if (data.badge)
  {
    (conf.badges.user[uid] ??= {})['bttv/pro'] = data.badge.url;
    const badges = (conf.chat.querySelector
                    (`.chat-line[data-user-id="${uid}"] .badges`));
    if (badges && !badges.querySelector ('img[alt="[bttv/pro]"]'))
    {
      const img = document.createElement ('img');
      img.src = data.badge.url;
      img.alt = '[bttv/pro]';
      const pronouns = badges.querySelector ('.pronouns');
      if (pronouns)
        pronouns.before (img);
      else
        badges.append (img);
      badges.classList.remove ('hidden');
    }
  }
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
  {
    (conf.cosmetics[uid] ??= []).push ('glow');
    conf.chat.querySelector (`.chat-line[data-user-id="${uid}"] .nick`)
      ?.classList.add ('glow');
  }
}

if (!conf.no.bttv)
  conf.onJoinRoom.push (joinBttvRoom);

async function joinBttvRoom (rid)
{
  try
  {
    sendBttvJoin (rid);
    const response = await
      fetch (`https://api.betterttv.net/3/cached/users/twitch/${rid}`);
    if (response.status == 404)
      return;
    const json = await response.json ();
    conf.emotes.room[rid] ??= { __proto__: null };
    for (const emote of json.channelEmotes)
      addBttvEmote (emote, conf.emotes.room[rid], 'room');
    for (const emote of json.sharedEmotes)
      addBttvEmote (emote, conf.emotes.room[rid], 'room');
  }
  catch (e)
  {
    displayError ('Failed to load channel BTTV emotes', e);
  }
}

function addBttvEmote ({ id, code }, dest, scope)
{
  const emote = {
    code,
    source: [ 'bttv', scope ]
  };
  if (bttv.special[code])
    emote.style = bttv.special[emote.code];
  emote.url = 'https://cdn.betterttv.net/emote/' +
    `${id}/${bttv.emoteStyle}${conf.emoteScale}x.webp`;
  conf.preload.push (emote.url);
  dest[code] = emote;
  bttv.emoteCode[id] = code;
}
