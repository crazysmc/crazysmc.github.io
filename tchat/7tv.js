'use strict';

const stv = {
  scale: ({ 2: '2', 3: '4' })[opt.get ('scale')] ?? '1',
  emoteStyle: opt.has ('static') ? '_static' : '',
  format: opt.has ('7tv', 'webp') ? 'webp' : 'avif',
  emoteCode: {},
  activeSet: {},
};

addEventListener ('load', init7tv);

function init7tv ()
{
  if (conf.no['7tv'])
    return;
  // TODO event-api socket

  fetch ('https://7tv.io/v3/emote-sets/global')
    .then (response => response.json ())
    .then (json => {
      for (const emote of json.emotes)
        add7tvEmote (emote, conf.emotes.global, 'global');
    })
    .catch (console.error);
}

if (!conf.no['7tv'])
  conf.onJoinRoom.push (join7tvRoom);

async function join7tvRoom (rid)
{
  const response = await fetch (`https://7tv.io/v3/users/twitch/${rid}`);
  if (response.status == 404)
    return;
  const json = await response.json ();
  stv.activeSet[rid] = json.emote_set.id;
  conf.emotes.room[rid] ??= { __proto__: null };
  for (const emote of json.emote_set.emotes)
    add7tvEmote (emote, conf.emotes.room[rid], 'room');
}

function add7tvEmote (stvEmote, dest, scope)
{
  const emote = {
    code: stvEmote.name,
    source: [ '7tv', scope ]
  };
  if (stvEmote.flags & 1)
    emote.style = [ 'overlay' ];
  const data = stvEmote.data;
  const s = data.animated ? stv.emoteStyle : '';
  emote.url = `https:${data.host.url}/${stv.scale}x${s}.${stv.format}`;
  dest[emote.code] = emote;
  stv.emoteCode[stvEmote.id] = emote.code;
}
