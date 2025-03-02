'use strict';

const opt = new URLSearchParams (location.search);
const conf = {
  ws: new ReconnectingWebSocket ('wss://irc-ws.chat.twitch.tv:443', null,
                                 { automaticOpen: false }),
  nick: 'justinfan64537', // same as anonymous chatterino
  timeout: parseInt (opt.get ('time'), 10) * 1000,
  emoteStyle: opt.has ('static') ? 'static' : 'default',
  emoteScale: ({ 2: '2', 3: '3' })[opt.get ('scale')] ?? '1',
  badgeScale: ({ 2: 'image_url_2x',
                 3: 'image_url_4x' })[opt.get ('scale')] ?? 'image_url_1x',
  // available logo sizes 600x600, 300x300, 150x150, 70x70, 50x50, 28x28
  // -- https://www.teamfortress.tv/post/51230
  avatarSize: ({ 2: '50x50', 3: '70x70' })[opt.get ('scale')] ?? '28x28',
  no: new Proxy (opt.getAll ('no'), { get: (arr, x) => arr.includes (x) }),
  duration: (Intl.DurationFormat
             ? new Intl.DurationFormat ('en', { style: 'narrow' })
             : { format: (x) => `${x.seconds}s` }),

  template: {},
  joinedRooms: [],
  onJoinRoom: [],
  colors: {},
  badges: { global: {}, room: {}, user: {} },
  emotes: { global: { __proto__: null }, room: {}, user: {} },
  cosmetics: {},
};

addEventListener ('load', init);

function init ()
{
  conf.chat = document.getElementById ('chat-container');
  const template = document.getElementById ('chat-template');
  conf.template.chatLine = template.content.querySelector ('.chat-line');
  conf.template.reply = template.content.querySelector ('.reply');

  fetch ('https://smc.2ix.at/global.php')
    .then (response => response.json ())
    .then (json => {
      for (const set of json.data)
        for (const version of set.versions)
          conf.badges.global[`${set.set_id}/${version.id}`] =
            version[conf.badgeScale];
    })
    .catch (console.error);

  conf.ws.addEventListener ('open', login);
  conf.ws.addEventListener ('message', receive);
  conf.ws.open ();
  addEventListener ('beforeunload', () => { conf.ws.close (); });
  setInterval (reduceChat, 200);
  setInterval (reduceColors, 300000);
}

function login ()
{
  conf.ws.send (`NICK ${conf.nick}\r\n`);
  const mem = opt.has ('chatters') ? ' twitch.tv/membership' : '';
  conf.ws.send (`CAP REQ :twitch.tv/tags twitch.tv/commands${mem}\r\n`);
  const join = opt.getAll ('join');
  if (join.length)
  {
    conf.ws.send (`JOIN #${join.join (',#')}\r\n`);
    document.documentElement.dataset.join = join.length;
  }
  document.documentElement.dataset.scale = conf.emoteScale;
}

function receive (event)
{
  for (const line of event.data.split ('\r\n'))
  {
    if (!line)
      continue;
    const msg = parse (line);
    const rid = msg.tags['room-id'];
    switch (msg.command)
    {
      case 'PING':
        conf.ws.send (`PONG :${msg.params[0]}\r\n`);
        break;

      case 'RECONNECT':
        conf.ws.refresh ();
        login ();
        break;

      case 'ROOMSTATE':
        joinedRoom (rid, msg.params[0])
          .catch (console.error);
        break;

      case 'PRIVMSG':
      case 'USERNOTICE':
      case 'NOTICE':
        displayChat (msg);
        break;

      case 'CLEARCHAT':
        const uid = msg.tags['target-user-id'];
        if (uid) /* user timeout or ban */
        {
          for (const del of conf.chat.querySelectorAll
               (`.chat-line[data-room-id="${rid}"][data-user-id="${uid}"]`))
            del.remove ();
          const seconds = msg.tags['ban-duration'];
          const action = seconds
            ? 'timed out for ' + conf.duration.format ({ seconds })
            : 'permanently banned';
          msg.source = msg.params[1];
          msg.params[1] = `has been ${action}.`;
        }
        else /* channel /clear */
        {
          for (const del of conf.chat.querySelectorAll
               (`.chat-line[data-room-id="${rid}"]`))
            del.remove ();
          msg.source = '';
          msg.params[1] = 'The chat has been cleared.';
        }
        if (opt.has ('bans'))
          displayChat (msg);
        break;

      case 'CLEARMSG':
        document.getElementById (msg.tags['target-msg-id'])
          ?.remove ();
        break;

      case 'JOIN':
      case 'PART':
        if (!msg.source.startsWith (`${conf.nick}!`))
        {
          msg.params[1] = msg.command == 'JOIN' ? ' joined' : ' parted';
          const prev = conf.chat.firstChild;
          if (prev?.classList.contains (msg.command))
          {
            const nick = prev.querySelector ('.nick');
            if (prev.dataset.channel == msg.params[0])
            {
              msg.source = `${nick.textContent}, ${msg.source}`;
              prev.remove ();
            }
          }
          displayChat (msg);
        }
        break;
    }
  }
}

function reduceChat ()
{
  const oldest = Date.now () - conf.timeout;
  for (const line of conf.chat.childNodes)
  {
    if (line.offsetTop + line.offsetHeight < 0)
      line.remove ();
    if (oldest && parseInt (line.dataset.tmiSentTs, 10) < oldest)
      line.classList.add ('fade-out');
  }
}

function reduceColors ()
{
  const oldest = Date.now () - 900000;
  for (const uid in conf.colors)
    if (conf.colors[uid].since < oldest)
      delete conf.colors[uid];
}

async function joinedRoom (rid, channel)
{
  if (conf.badges.room[rid])
    return;
  conf.badges.room[rid] = { channel };
  try
  {
    const response = await fetch (`https://smc.2ix.at/user.php?id=${rid}`);
    const json = await response.json ();
    for (const set of json.data)
      for (const version of set.versions)
        conf.badges.room[rid][`${set.set_id}/${version.id}`] =
          version[conf.badgeScale];
  }
  finally
  {
    conf.joinedRooms.push (rid);
    document.documentElement.dataset.join = conf.joinedRooms.length;
    return await Promise
      .allSettled (conf.onJoinRoom.map (callback => callback (rid)));
  }
}

function displayChat (msg)
{
  const p = conf.template.chatLine.cloneNode (true);
  for (const key in msg.tags)
    p.setAttribute ('data-' + key, msg.tags[key]);
  if (!p.dataset.tmiSentTs)
    p.dataset.tmiSentTs = Date.now ();
  p.dataset.channel = msg.params[0];
  if (msg.tags.id)
    p.id = msg.tags.id;
  p.classList.add (msg.command);
  try
  {
    formatChat (msg, p);
  }
  finally
  {
    if (!p.dataset.duplicate)
      conf.chat.prepend (p);
  }
}

function formatChat (msg, p)
{
  const sourceNick = msg.source.replace (/!.*/, '');
  const uid = msg.tags['user-id'];
  let   rid = msg.tags['room-id'];

  const channel = p.querySelector ('.channel');
  const img = document.createElement ('img');
  if (rid)
    img.src = conf.badges.room[rid]?.avatar ?? '';
  else
    img.src = Object.values (conf.badges.room)
      .find (x => x.channel == msg.params[0])
      ?.avatar ?? '';
  img.alt = msg.params[0];
  channel.replaceChildren (img);
  const srid = msg.tags['source-room-id'];
  if (srid && srid != rid)
  {
    const sid = msg.tags['source-id'];
    if (document.getElementById (sid))
    {
      p.dataset.duplicate = true;
      return;
    }
    p.id = sid;
    joinedRoom (srid, null)
      .then (() => {
        img.src = conf.badges.room[srid].avatar ?? '';
        img.alt = conf.badges.room[srid].channel ?? `#[${srid}]`;
      })
      .catch (console.error);
    msg.tags.badges = msg.tags['source-badges'];
    rid = srid;
  }

  const nick = p.querySelector ('.nick');
  const color = readableColor (msg.tags.color) ?? '';
  if (color)
    conf.colors[uid] = { color, nick: sourceNick, since: Date.now () };
  nick.style.color = color;
  nick.textContent = msg.tags['display-name'] || sourceNick;
  if (uid)
    extCosmetics (uid, nick);

  const message = p.querySelector ('.message');
  let text = msg.params[1];
  if (text && text[0] == '\x01')
  {
    text = text.replace (/^\x01ACTION (.*)\x01/, '$1');
    message.classList.add ('action');
  }

  if (msg.tags.emotes)
  {
    const list = text.split(/(?:)/u);
    for (const emote of msg.tags.emotes.split ('/'))
    {
      const [id, ranges] = emote.split (':');
      for (const range of ranges.split (','))
      {
        const [start, end] = range.split ('-').map (x => parseInt (x, 10));
        const img = newEmote ();
        img.classList.add ('native');
        img.src = 'https://static-cdn.jtvnw.net/emoticons/v2/' +
          `${id}/${conf.emoteStyle}/dark/${conf.emoteScale}.0`;
        const name = list.splice (start, 1 + end - start, img,
                                  ...new Array (end - start));
        img.alt = name.join ('');
      }
    }
    for (const c of list)
    {
      if (c == undefined)
        continue;
      if (c.nodeType || message.lastChild?.nodeType != Node.TEXT_NODE)
        message.append (c);
      else
        message.lastChild.textContent += c;
    }
  }
  else
    message.textContent = text;

  if (!msg.tags.id)
    return;

  const badges = p.querySelector ('.badges');
  if (msg.tags.badges)
    for (const badge of msg.tags.badges.split (','))
    {
      const img = document.createElement ('img');
      img.src = (conf.badges.room[rid]?.[badge] ??
                 conf.badges.global[badge] ?? '');
      img.alt = `[${badge}]`;
      badges.append (img);
    }

  extBadges (rid, uid, badges);
  if (badges.childNodes.length)
    badges.classList.remove ('hidden');

  if (!conf.no.pronouns)
  {
    const pro = document.createElement ('span');
    pro.classList.add ('pronouns', 'hidden');
    getPronouns (msg.tags.login ?? sourceNick)
      .then (text => {
        if (!text)
          return;
        pro.textContent = text;
        pro.classList.remove ('hidden');
        badges.classList.remove ('hidden');
      })
      .catch (() => { });
    badges.append (pro);
  }

  extEmotes (rid, uid, message);
  atMention (message);

  const systemMsg = msg.tags['system-msg'];
  if (systemMsg)
  {
    const span = document.createElement ('span');
    span.classList.add ('system-msg');
    span.textContent = systemMsg;
    if (msg.tags['msg-param-category'] == 'watch-streak')
      span.textContent = systemMsg.replace (/ this month/, '');
    const br = document.createElement ('br');
    message.prepend (span, br);
  }

  const replyTo = msg.tags['reply-parent-msg-body'];
  if (replyTo)
  {
    const reply = conf.template.reply.cloneNode (true);
    reply.firstElementChild.textContent = replyTo;
    const replyMsg = reply.querySelector ('.message');
    replyMsg.replaceChildren (...message.childNodes);
    message.replaceWith (reply);
  }
}

function readableColor (color)
{
  const match = color?.match (/^#(..)(..)(..)$/);
  if (!match)
    return color;
  const [ r, g, b ] = [ 1, 2, 3 ].map (i => parseInt (match[i], 16));
  return r * 299 + g * 587 + b * 114 <= 50000
    ? `hsl(from ${color} h s calc(l + 30))`
    : color;
}

function extCosmetics (uid, nick)
{
  if (conf.cosmetics[uid])
    nick.classList.add (...conf.cosmetics[uid]);
}

function extBadges (rid, uid, badges)
{
  for (const badge in { ...conf.badges.user[uid],
                        ...conf.badges.room[rid].user?.[uid] })
  {
    let mod;
    if (badge == 'ffz/2' &&
        (mod = badges.querySelector ('img[alt="[moderator/1]"]')))
    {
      mod.classList.add ('ffz-bot');
      continue;
    }
    const img = document.createElement ('img');
    img.src = conf.badges.user[uid][badge];
    img.alt = `[${badge}]`;
    badges.append (img);
  }
}

function extEmotes (rid, uid, message)
{
  for (const node of message.childNodes)
    if (node.nodeType == Node.TEXT_NODE)
      for (const word of node.nodeValue.matchAll (/\S+/g))
      {
        const emote = (conf.emotes.user[uid]?.[word[0]] ??
                       conf.emotes.room[rid]?.[word[0]] ??
                       conf.emotes.global[word[0]]);
        if (!emote)
          continue;
        const img = newEmote ();
        img.classList.add (...emote.source);
        img.src = emote.url;
        img.alt = word[0];
        const next = node.splitText (word.index);
        next.nodeValue = next.nodeValue.slice (word[0].length);
        node.after (img);
        if (emote.style)
          img.classList.add (...emote.style);
        break;
      }
  message.normalize ();

  for (const prefix of message.querySelectorAll ('.prefix'))
  {
    if (prefix.nextSibling?.nodeType == Node.TEXT_NODE &&
        !prefix.nextSibling.nodeValue.trim ())
      prefix.nextSibling.remove ();
    if (prefix.nextSibling instanceof HTMLImageElement)
    {
      if (prefix.classList.contains ('no-space') &&
          prefix.previousSibling?.nodeType == Node.TEXT_NODE &&
          !prefix.previousSibling.nodeValue.trim ())
        prefix.previousSibling.remove ();
      prefix.classList.remove ('prefix');
      prefix.nextSibling.classList.add (...prefix.classList);
      prefix.remove ();
    }
  }

  for (const suffix of message.querySelectorAll ('.suffix'))
  {
    if (suffix.previousSibling?.nodeType == Node.TEXT_NODE &&
        !suffix.previousSibling.nodeValue.trim ())
      suffix.previousSibling.remove ();
    if (suffix.previousSibling instanceof HTMLImageElement)
    {
      suffix.classList.remove ('suffix');
      suffix.previousSibling.classList.add (...suffix.classList);
      suffix.remove ();
    }
  }

  for (const overlay of message.querySelectorAll ('.overlay'))
  {
    if (overlay.previousSibling?.nodeType == Node.TEXT_NODE &&
        !overlay.previousSibling.nodeValue.trim ())
      overlay.previousSibling.remove ();
    let stack = overlay.previousSibling;
    if (stack instanceof HTMLImageElement)
    {
      const img = stack;
      stack = document.createElement ('span');
      stack.classList.add ('emote-stack');
      img.replaceWith (stack);
      stack.append (img);
    }
    if (stack instanceof HTMLSpanElement)
    {
      overlay.remove ();
      stack.append (overlay);
    }
  }
}

function atMention (message)
{
  for (const node of message.childNodes)
    if (node.nodeType == Node.TEXT_NODE)
      for (const at of node.nodeValue.matchAll (/@\S+/g))
      {
        const login = at[0].slice (1)
          .toLowerCase ();
        const [uid, col] = Object.entries (conf.colors)
          .find (([k, v]) => v.nick == login) ?? [];
        if (!uid)
          continue;
        const nick = document.createElement ('span');
        nick.classList.add ('nick', 'at');
        nick.style.color = conf.colors[uid]?.color;
        nick.textContent = at[0];
        extCosmetics (uid, nick);
        const next = node.splitText (at.index);
        next.nodeValue = next.nodeValue.slice (at[0].length);
        node.after (nick);
        break;
      }
}

function newEmote ()
{
  const img = document.createElement ('img');
  img.onload = () => {
    if (img.classList.contains ('rotate-l') ||
        img.classList.contains ('rotate-r'))
      img.style.width = `${img.naturalHeight}px`;
    else if (img.classList.contains ('grow-x'))
    {
      img.style.height = `${img.naturalHeight}px`;
      img.style.width  = `${2 * img.naturalWidth}px`;
    }
  };
  return img;
}

function parse (msg)
{
  const obj = { tags: {}, source: null, command: null, params: [] };
  const space = / +(.*)/;
  if (msg[0] == '@')
  {
    msg = msg.slice (1);
    let tags;
    [tags, msg] = msg.split (space, 2);
    for (const tag of tags.split (';'))
    {
      const [key, val] = tag.split (/=(.*)/, 2);
      obj.tags[key] = val.replaceAll (/\\(.?)/g, tagValue);
    }
  }
  if (msg[0] == ':')
  {
    msg = msg.slice (1);
    [obj.source, msg] = msg.split (space, 2);
  }
  [obj.command, msg] = msg.split (space, 2);
  while (msg)
  {
    if (msg[0] == ':')
    {
      obj.params.push (msg.slice (1));
      break;
    }
    let param;
    [param, msg] = msg.split (space, 2);
    obj.params.push (param);
  }
  return obj;
}

function tagValue (match, c)
{
  return { ':': ';', s: ' ', r: '\r', n: '\n' }[c] || c;
}
