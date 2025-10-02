'use strict';

const hermes = {
  scale: ({ 2: 'url_2x', 3: 'url_4x' })[opt.get ('scale')] ?? 'url_1x',
  ws: new ReconnectingWebSocket (
      'wss://hermes.twitch.tv/v1?clientId=kimne78kx3ncx6brgo4mv6wki5h1ko',
      null,
      { automaticOpen: false }),
};

addEventListener ('load', initHermes);

function initHermes ()
{
  if (conf.no.hermes)
    return;
  hermes.ws.addEventListener ('message', receiveHermes);
  hermes.ws.open ();
  addEventListener ('beforeunload', () => { hermes.ws.close (); });
}

function receiveHermes (event)
{
  const json = JSON.parse (event.data);
  switch (json.type)
  {
    case 'welcome':
      rejoinHermesRooms ();
      break;

    case 'notification':
      receiveHermesNotif (json.notification.pubsub);
      break;
  }
}

function receiveHermesNotif (pubsub)
{
  const json = JSON.parse (pubsub);
  switch (json.type)
  {
    case 'reward-redeemed':
      const tmiSentTs = Date.parse (json.data.timestamp);
      const redemption = json.data.redemption;
      const rid = redemption.channel_id;
      const msg = { command: 'reward-redeemed' };
      msg.tags = {
        'tmi-sent-ts':  tmiSentTs.valueOf (),
        id:             redemption.id,
        'room-id':      rid,
        'user-id':      redemption.user.id,
        login:          redemption.user.login,
        'display-name': redemption.user.display_name,
        'reward-id':    redemption.reward.id,
        'reward-cost':  redemption.reward.cost,
        'reward-color': redemption.reward.background_color,
      };
      msg.params = [
        conf.badges.room[rid].channel,
        redemption.user_input ?? ''
      ];
      const url = (redemption.reward.image ??
                   redemption.reward.default_image)?.[hermes.scale];
      const img = document.createElement ('img');
      img.src = url;
      img.alt = '';
      msg.reward = [
        `redeemed ${redemption.reward.title} `,
        img,
        ` ${redemption.reward.cost}`,
      ];
      displayChat (msg);
      break;
  }
}

function rejoinHermesRooms ()
{
  for (const rid of conf.joinedRooms)
    if (!sendHermesJoin (rid))
      break;
}

function sendHermesJoin (rid)
{
  try
  {
    const obj = {
      type: 'subscribe',
      id: `sub.A${rid}`,
      subscribe: {
        id: `A${rid}`,
        type: 'pubsub',
        pubsub: { topic: `community-points-channel-v1.${rid}` },
      },
      timestamp: new Date (),
    };
    hermes.ws.send (JSON.stringify (obj));
    return true;
  }
  catch
  {
    return false;
  }
}

if (!conf.no.hermes)
  conf.onJoinRoom.push (sendHermesJoin);
