'use strict';

const bttv = {
  emoteStyle: opt.has ('static') ? 'static/' : '',
  ws: new ReconnectingWebSocket ('wss://sockets.betterttv.net/ws', null,
                                 { automaticOpen: false }),
  emoteCode: {},
  special: {
    'c!': ['prefix', 'cursed'],
    'h!': ['prefix', 'flip-x'],
    'l!': ['prefix', 'rotate-l'],
    'p!': ['prefix', 'party'],
    'r!': ['prefix', 'rotate-r'],
    's!': ['prefix', 'shake'],
    'v!': ['prefix', 'flip-y'],
    'w!': ['prefix', 'grow-x'],
    'z!': ['prefix', 'no-space'],
    CandyCane: ['overlay'],
    IceCold: ['overlay'],
    ReinDeer: ['overlay'],
    SantaHat: ['overlay'],
    SoSnowy: ['overlay'],
    TopHat: ['overlay'],
    cvHazmat: ['overlay'],
    cvMask: ['overlay'],
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
      {
        if (bttv.special[emote.code])
          emote.style = bttv.special[emote.code];
        addBttvEmote (emote, emoteSrc.global, 'global');
      }
    })
    .catch (console.error);
  fetch ('https://api.betterttv.net/3/cached/badges/twitch')
    .then (response => response.json ())
    .then (json => {
      for (const user of json)
        (badgeSrc.user[user.providerId] ??= {})[`bttv/${user.badge.type}`] =
          user.badge.svg;
    })
    .catch (console.error);
}

function rejoinBttvRooms ()
{
  for (const rid in conf.joinedRooms)
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
      emoteSrc.room[rid] ??= {};
      addBttvEmote (emote, emoteSrc.room[rid], 'room');
      displayBttvAction (rid, json.name, `added emote ${emote.code}.`);
      break;

    case 'emote_update':
      bttv.emoteCode[emote.id] = emote.code;
      if (emoteSrc.room[rid]?.[old]?.source[0] == 'bttv')
      {
        emoteSrc.room[rid][emote.code] = emoteSrc.room[rid][old];
        delete emoteSrc.room[rid][old];
      }
      else
        addBttvEmote (emote, emoteSrc.room[rid], 'room');
      displayBttvAction (rid, json.name,
                         `renamed emote ${old} -> ${emote.code}.`);
      break;

    case 'emote_delete':
      delete bttv.emoteCode[json.data.emoteId];
      if (emoteSrc.room[rid]?.[old]?.source[0] == 'bttv')
        delete emoteSrc.room[rid][old];
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
                 params: [ twitchId[rid].channel, action ] });
}

function updateBttvUser (data)
{
  console.debug (data);
  const uid = data.providerId;
  if (data.badge)
    (badgeSrc.user[uid] ??= {})['bttv/pro'] = data.badge.url;
  else
    delete badgeSrc.user[uid]?.['bttv/pro'];
  if (data.pro)
  {
    emoteSrc.user[uid] ??= {};
    for (const emote of data.emotes)
      addBttvEmote (emote, emoteSrc.user[uid], 'personal');
  }
  else if (emoteSrc.user[uid])
    for (const emote of emoteSrc.user[uid])
      if (emote.source[0] == 'bttv')
        delete emoteSrc.user[uid][emote];
  if (data.glow)
    (userCosmetics[uid] ??= []).push ('glow');
}

async function joinBttvRoom (rid)
{
  if (conf.no.bttv)
    return;
  sendBttvJoin (rid);
  const response = await
    fetch (`https://api.betterttv.net/3/cached/users/twitch/${rid}`);
  const json = await response.json ();
  // TODO give json.bots the https://cdn.betterttv.net/tags/bot.png badge
  // problem: usernames instead of ids, no scaled badges
  emoteSrc.room[rid] ??= {};
  for (const emote of json.channelEmotes)
    addBttvEmote (emote, emoteSrc.room[rid], 'room');
  for (const emote of json.sharedEmotes)
    addBttvEmote (emote, emoteSrc.room[rid], 'room');
}

function addBttvEmote (emote, dest, scope)
{
  emote.source = ['bttv', scope];
  emote.url = 'https://cdn.betterttv.net/emote/' +
    `${emote.id}/${bttv.emoteStyle}${conf.emoteScale}x.webp`;
  dest[emote.code] = emote
  bttv.emoteCode[emote.id] = emote.code;
}
