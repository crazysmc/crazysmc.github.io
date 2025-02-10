'use strict';

const opt = new URLSearchParams (location.search);
const conf = {
  timeout: parseInt (opt.get ('time'), 10) * 1000,
  emoteStyle: opt.has ('static') ? 'static' : 'default',
  emoteScale: ({ 2: '2.0', 3: '3.0' })[opt.get ('scale')] ?? '1.0',
};
const ws = new ReconnectingWebSocket ('wss://irc-ws.chat.twitch.tv:443', null,
                                      { automaticOpen: false });
const template = {};
let chat;

addEventListener ('load', init);

function init ()
{
  chat = document.getElementById ('chat-container');
  const t = document.getElementById ('chat-template');
  template.chatLine = t.content.querySelector ('.chat-line');
  template.reply = t.content.querySelector ('.reply');
  ws.addEventListener ('open', login);
  ws.addEventListener ('message', receive);
  ws.open ();
  addEventListener ('beforeunload', () => { ws.close (); });
  setInterval (reduceChat, 200);
}

function login ()
{
  ws.send ('NICK justinfan64537\r\n'); // same as anonymous chatterino
  ws.send ('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
  const join = opt.getAll ('join');
  if (join.length)
  {
    ws.send (`JOIN #${join.join (',#')}\r\n`);
    chat.dataset.join = join.length;
  }
}

function receive (event)
{
  for (const line of event.data.split ('\r\n'))
  {
    if (!line)
      continue;
    const msg = parse (line);
    switch (msg.command)
    {
      case 'PING':
        ws.send (`PONG :${msg.params[0]}\r\n`);
        break;
      case 'RECONNECT':
        ws.refresh ();
        login ();
        break;
      case 'PRIVMSG':
      case 'USERNOTICE':
      case 'NOTICE':
        displayChat (msg);
        break;
      case 'CLEARCHAT':
        const rid = msg.tags['room-id'];
        const uid = msg.tags['target-user-id'];
        if (uid) /* user timeout or ban */
        {
          for (const del of chat.querySelectorAll
               (`.chat-line[data-room-id="${rid}"][data-user-id="${uid}"]`))
            del.remove ();
          const duration = msg.tags['ban-duration'];
          const action = duration
            ? `timed out for ${duration}s`
            : 'permanently banned';
          msg.source = msg.params[1];
          msg.params[1] = `has been ${action}`;
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
        const del = document.getElementById (msg.tags['target-msg-id']);
        if (del)
          del.remove ();
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

function displayChat (msg)
{
  const p = template.chatLine.cloneNode (true);
  for (const key in msg.tags)
    p.setAttribute ('data-' + key, msg.tags[key]);
  p.id = msg.tags.id;
  p.classList.add (msg.command);

  const channel = p.querySelector ('.channel');
  channel.textContent = msg.params[0];

  const badges = p.querySelector ('.badges');
  if (msg.tags.badges)
  {
    badges.textContent = msg.tags.badges; // TODO
    for (const badge of msg.tags.badges.split (','))
    {
      // https://static-cdn.jtvnw.net/badges/v1/${id}/1
    }
  }
  else
    badges.remove ();

  const nick = p.querySelector ('.nick');
  nick.style.color = msg.tags.color;
  nick.textContent = msg.tags['display-name'] ||
    msg.source.replace (/!.*/, '');

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
        const img = document.createElement ('img');
        img.src = 'https://static-cdn.jtvnw.net/emoticons/v2/' +
          `${id}/${conf.emoteStyle}/dark/${conf.emoteScale}`;
        const name = list.splice (start, 1 + end - start, img,
                                  ...new Array (end - start));
        img.alt = name.join ('');
        console.log (`emote from ${start} to ${end}: ${img.alt}`);
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

  chat.prepend (p);
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
