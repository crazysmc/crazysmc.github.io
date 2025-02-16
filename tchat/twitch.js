'use strict';

const opt = new URLSearchParams (location.search);
const conf = {
  nick: 'justinfan64537', // same as anonymous chatterino
  timeout: parseInt (opt.get ('time'), 10) * 1000,
  emoteStyle: opt.has ('static') ? 'static' : 'default',
  emoteScale: ({ 2: '2', 3: '3' })[opt.get ('scale')] ?? '1',
  badgeScale: ({ 2: 'image_url_2x',
                 3: 'image_url_4x' })[opt.get ('scale')] ?? 'image_url_1x',
  no: new Proxy (opt.getAll ('no'), { get: (arr, x) => arr.includes (x) }),
  joinedRooms: [],
  duration: (Intl.DurationFormat
             ? new Intl.DurationFormat ('en', { style: 'narrow' })
             : { format: (x) => `${x.seconds}s` }),
};
const ws = new ReconnectingWebSocket ('wss://irc-ws.chat.twitch.tv:443', null,
                                      { automaticOpen: false });
const template = {};
const twitchId = {};
const badgeSrc = { global: {}, room: {}, user: {} };
const emoteSrc = { global: {}, room: {}, user: {} };
const userCosmetics = {};
let chat;

addEventListener ('load', init);

function init ()
{
  chat = document.getElementById ('chat-container');
  const t = document.getElementById ('chat-template');
  template.chatLine = t.content.querySelector ('.chat-line');
  template.reply = t.content.querySelector ('.reply');

  fetch ('https://smc.2ix.at/global.php')
    .then (response => response.json ())
    .then (json => {
      for (const set of json.data)
        for (const version of set.versions)
          badgeSrc.global[`${set.set_id}/${version.id}`] =
            version[conf.badgeScale];
    })
    .catch (console.error);

  ws.addEventListener ('open', login);
  ws.addEventListener ('message', receive);
  ws.open ();
  addEventListener ('beforeunload', () => { ws.close (); });
  setInterval (reduceChat, 200);
}

function login ()
{
  ws.send (`NICK ${conf.nick}\r\n`);
  const mem = opt.has ('chatters') ? ' twitch.tv/membership' : '';
  ws.send (`CAP REQ :twitch.tv/tags twitch.tv/commands${mem}\r\n`);
  const join = opt.getAll ('join');
  if (join.length)
  {
    ws.send (`JOIN #${join.join (',#')}\r\n`);
    document.body.dataset.join = join.length;
  }
  document.body.dataset.scale = conf.emoteScale;
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
        ws.send (`PONG :${msg.params[0]}\r\n`);
        break;

      case 'RECONNECT':
        ws.refresh ();
        login ();
        break;

      case 'ROOMSTATE':
        joinedRoom (rid, msg.params[0]);
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
          for (const del of chat.querySelectorAll
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
          for (const del of chat.querySelectorAll
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
          if (chat.firstChild?.classList.contains (msg.command))
          {
            const channel = chat.firstChild?.querySelector ('.channel');
            const nick = chat.firstChild?.querySelector ('.nick');
            if (channel.textContent == msg.params[0])
            {
              msg.source = `${nick.textContent}, ${msg.source}`;
              chat.firstChild.remove ();
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
  for (const line of chat.childNodes)
    if (line.offsetTop + line.offsetHeight < 0 ||
        oldest && parseInt (line.dataset.tmiSentTs, 10) < oldest)
      line.remove ();
}

function joinedRoom (rid, channel)
{
  if (twitchId[rid]?.channel)
    return;
  (twitchId[rid] ??= {}).channel = channel;
  badgeSrc.room[rid] = {};
  fetch (`https://smc.2ix.at/user.php?id=${rid}`)
    .then (response => response.json ())
    .then (json => {
      for (const set of json.data)
        for (const version of set.versions)
          badgeSrc.room[rid][`${set.set_id}/${version.id}`] =
            version[conf.badgeScale];
    })
    .catch (console.error);
  conf.joinedRooms.push (rid);
  joinBttvRoom (rid);
}

function displayChat (msg)
{
  const p = template.chatLine.cloneNode (true);
  for (const key in msg.tags)
    p.setAttribute ('data-' + key, msg.tags[key]);
  if (msg.tags.id)
    p.id = msg.tags.id;
  p.classList.add (msg.command);

  formatChat (msg, p);
  chat.prepend (p);
}

function formatChat (msg, p)
{
  const sourceNick = msg.source.replace (/!.*/, '');
  const rid = msg.tags['room-id'];
  const uid = msg.tags['user-id'];

  const channel = p.querySelector ('.channel');
  channel.textContent = msg.params[0];

  const nick = p.querySelector ('.nick');
  nick.style.color = msg.tags.color ?? '';
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
        const img = emoteImage ();
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
      img.src = badgeSrc.room[rid]?.[badge] ?? badgeSrc.global[badge] ?? '';
      img.alt = `[${badge}]`;
      badges.append (img);
    }

  extBadges (rid, uid, badges);

  if (!conf.no.pronouns)
  {
    const pro = document.createElement ('span');
    pro.classList.add ('pronouns');
    getPronouns (msg.tags.login ?? sourceNick)
      .then (text => { pro.textContent = text; })
      .catch (() => { });
    badges.append (pro);
  }

  extEmotes (rid, uid, message);

  const systemMsg = msg.tags['system-msg'];
  if (systemMsg)
  {
    const span = document.createElement ('span');
    span.classList.add ('system-msg');
    span.textContent = systemMsg;
    const br = document.createElement ('br');
    message.prepend (span, br);
  }

  const replyTo = msg.tags['reply-parent-display-name'] ||
                  msg.tags['reply-parent-user-login'];
  if (replyTo)
  {
    const reply = template.reply.cloneNode (true);
    const nick = reply.querySelector ('.nick');
    const uid = msg.tags['reply-parent-user-id'];
    const pn = chat.querySelector (`.chat-line[data-user-id="${uid}"] .nick`);
    nick.style.color = pn?.style.color;
    nick.textContent = replyTo;
    const pm = reply.querySelector ('.message');
    pm.textContent = msg.tags['reply-parent-msg-body'];
    const replyMsg = reply.querySelector ('.reply-message');
    replyMsg.replaceChildren (...message.childNodes);
    message.replaceChildren (reply);
  }
}

function extCosmetics (uid, nick)
{
  if (userCosmetics[uid])
    nick.classList.add (...userCosmetics[uid]);
}

function extBadges (rid, uid, badges)
{
  for (const badge in badgeSrc.user[uid])
  {
    const img = document.createElement ('img');
    img.src = badgeSrc.user[uid][badge];
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
        const emote = (emoteSrc.user[uid]?.[word[0]] ??
                       emoteSrc.room[rid]?.[word[0]] ??
                       emoteSrc.global[word[0]]);
        if (!emote)
          continue;
        const img = emoteImage ();
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
      if (prefix.classList.contains ('no-space'))
      {
        if (prefix.previousSibling?.nodeType == Node.TEXT_NODE &&
            !prefix.previousSibling.nodeValue.trim ())
          prefix.previousSibling.remove ();
      }
      else
      {
        prefix.classList.remove ('prefix');
        prefix.nextSibling.classList.add (...prefix.classList);
      }
      prefix.remove ();
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

function emoteImage ()
{
  const img = document.createElement ('img');
  img.onload = () => {
    if (!img.classList.contains ('grow-x'))
      return;
    img.style.height = `${img.naturalHeight}px`;
    img.style.width  = `${2 * img.naturalWidth}px`;
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
