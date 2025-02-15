'use strict';

const bttv = {
  emoteStyle: opt.has ('static') ? 'static/' : '',
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
  fetch ('https://api.betterttv.net/3/cached/emotes/global')
    .then (response => response.json ())
    .then (json => {
      for (const emote of json)
      {
        emote.source = ['bttv', 'global'];
        emote.url = 'https://cdn.betterttv.net/emote/' +
          `${emote.id}/${bttv.emoteStyle}${conf.emoteScale}x.webp`;
        if (bttv.special[emote.code])
          emote.style = bttv.special[emote.code];
        emoteSrc.global[emote.code] = emote;
      }
    })
    .catch (console.error);
}

async function getUser (rid)
{
  const response = await
    fetch (`https://api.betterttv.net/3/cached/users/twitch/${rid}`);
  const json = await response.json ();
  console.debug (json);
  emoteSrc.room[rid] ??= {};
  for (const emote of [...json.channelEmotes, ...json.sharedEmotes])
  {
    emote.source = ['bttv', 'room'];
    emote.url = 'https://cdn.betterttv.net/emote/' +
      `${emote.id}/${bttv.emoteStyle}${conf.emoteScale}x.webp`;
    emoteSrc.room[rid][emote.code] = emote;
  }
}
