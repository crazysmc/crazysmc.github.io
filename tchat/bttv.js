'use strict';

const bttv = {
  emoteStyle: opt.has ('static') ? 'static/' : '',
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
        emoteSrc.global[emote.code] = emote;
      }
    })
    .catch (console.error);
}
