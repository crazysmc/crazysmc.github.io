'use strict';

const ffz = {
  scale: ({ 2: '2', 3: '4' })[opt.get ('scale')] ?? '1',
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
  const style = document.createElement ('style');
  document.head.append (style);
  ffz.css = style.sheet;

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
    .catch (e => displayError ('Failed to load global FFZ emotes', e));
  fetch ('https://api.frankerfacez.com/v1/badges/ids')
    .then (response => response.json ())
    .then (json => {
      for (const id in json.users)
        for (const uid of json.users[id])
          (conf.badges.user[uid] ??= {})[`ffz/${id}`] =
            `https://cdn.frankerfacez.com/badge/${id}/${ffz.scale}/rounded`;
    })
    .catch (e => displayError ('Failed to load global FFZ badges', e));
}

if (!conf.no.bttv)
  conf.onJoinRoom.push (joinFfzRoom);

async function joinFfzRoom (rid)
{
  try
  {
    const response = await
      fetch (`https://api.frankerfacez.com/v1/room/id/${rid}`);
    if (response.status == 404)
      return;
    const json = await response.json ();
    if (!conf.badges.room[rid].channel)
      conf.badges.room[rid].channel = `#${json.room.id}`;
    conf.emotes.room[rid] ??= { __proto__: null };
    for (const emote of json.sets[json.room.set].emoticons)
      addFfzEmote (emote, conf.emotes.room[rid], 'room');
    const roomUrl = 'https://cdn.frankerfacez.com/room-badge/';
    if (json.room.vip_badge)
    {
      const rule =
        `.chat-line[data-source-room-id="${rid}"] .badges
            img[alt="[vip/1]"]
        ,.chat-line[data-room-id="${rid}"]:not([data-source-room-id]) .badges
            img[alt="[vip/1]"]
        { content: url(${roomUrl}vip/id/${rid}/${ffz.scale}); }`;
      ffz.css.insertRule (rule, ffz.css.cssRules.length);
    }
    if (json.room.mod_urls)
    {
      const rule =
        `.chat-line[data-source-room-id="${rid}"] .badges
            img[alt="[moderator/1]"]:not(.ffz-bot)
        ,.chat-line[data-room-id="${rid}"]:not([data-source-room-id]) .badges
            img[alt="[moderator/1]"]:not(.ffz-bot)
        { content: url(${roomUrl}mod/id/${rid}/${ffz.scale}/rounded); }`;
      ffz.css.insertRule (rule, ffz.css.cssRules.length);
    }
    conf.badges.room[rid].user ??= {};
    for (const id in json.room.user_badge_ids)
      for (const uid of json.room.user_badge_ids[id])
        (conf.badges.room[rid].user[uid] ??= {})[`ffz/${id}`] =
          `https://cdn.frankerfacez.com/badge/${id}/${ffz.scale}/rounded`;
  }
  catch (e)
  {
    displayError ('Failed to load channel FFZ emotes', e);
  }
}

function addFfzEmote ({ id, name, modifier, modifier_flags, animated },
                      dest, scope)
{
  const emote = {
    code: name,
    source: [ 'ffz', scope ]
  };
  if (modifier)
  {
    if (modifier_flags)
    {
      emote.style = [ 'suffix' ];
      for (const bit in ffz.flags)
        if (modifier_flags & bit)
          emote.style.push (ffz.flags[bit]);
    }
    else
      emote.style = [ 'overlay' ];
  }
  const anim = animated && !opt.has ('static') ? 'animated/' : '';
  emote.url = 'https://cdn.frankerfacez.com/emote/' +
    `${id}/${anim}${ffz.scale}`;
  conf.preload.push (emote.url);
  dest[emote.code] = emote;
}
