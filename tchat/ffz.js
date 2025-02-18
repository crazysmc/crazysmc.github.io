'use strict';

const ffz = {
  scale: ({ 2: '2', 3: '4' })[opt.get ('scale')] ?? '1',
  badges: [],
  flags: {
    2: 'flip-x',
    4: 'flip-y',
    8: 'grow-x',
    2048: 'rainbow', // 'party',
    4096: 'hyper-red',
    8192: 'hyper-shake',
    16384: 'cursed',
    32768: 'jam',
    65536: 'bounce',
  },
};

addEventListener ('load', initFfz);

function initFfz ()
{
  if (conf.no.ffz)
    return;
  fetch ('https://api.frankerfacez.com/v1/set/global/ids')
    .then (response => response.json ())
    .then (json => {
      for (const set of json.default_sets)
        for (const emote of json.sets[set].emoticons)
          addFfzEmote (emote, conf.emotes.global, 'global');
      for (const set in json.user_ids)
        for (const uid of json.user_ids[set])
        {
          conf.emotes.user[uid] ??= { __proto__: null };
          for (const emote of json.sets[set].emoticons)
            addFfzEmote (emote, conf.emotes.user[uid], 'personal');
        }
    })
    .catch (console.error);
  fetch ('https://api.frankerfacez.com/v1/badges/ids')
    .then (response => response.json ())
    .then (json => {
      for (const id in json.users)
        for (const uid of json.users[id])
          (conf.badges.user[uid] ??= {})[`ffz/${id}`] =
            `https://cdn.frankerfacez.com/badge/${id}/${ffz.scale}/rounded`;
    })
    .catch (console.error);
}

if (!conf.no.bttv)
  conf.onJoinRoom.push (joinFfzRoom);

async function joinFfzRoom (rid)
{
  const response = await
    fetch (`https://api.frankerfacez.com/v1/room/id/${rid}`);
  const json = await response.json ();
  // TODO user_badge_ids, vip_badge, mod_urls
  conf.emotes.room[rid] ??= { __proto__: null };
  for (const emote of json.sets[json.room.set].emoticons)
    addFfzEmote (emote, conf.emotes.room[rid], 'room');
}

function addFfzEmote (ffzEmote, dest, scope)
{
  const emote = {
    id: ffzEmote.id,
    code: ffzEmote.name,
    source: [ 'ffz', scope ]
  };
  if (ffzEmote.modifier)
  {
    if (ffzEmote.modifier_flags)
    {
      emote.style = [ 'suffix' ];
      for (const bit in ffz.flags)
        if (ffzEmote.modifier_flags & bit)
          emote.style.push (ffz.flags[bit]);
    }
    else
      emote.style = [ 'overlay' ];
  }
  const animated = ffzEmote.animated && !opt.has ('static')
    ? 'animated/' : '';
  emote.url = 'https://cdn.frankerfacez.com/emote/' +
    `${emote.id}/${animated}${ffz.scale}`;
  dest[emote.code] = emote;
}
