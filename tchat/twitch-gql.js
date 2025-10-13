'use strict';

const gqlConf = {
  avatarSize: ({ 2: 50, 3: 70 })[opt.get ('scale')] ?? 28,
  badgeScale: ({ 2: 'DOUBLE',
                 3: 'QUADRUPLE' })[opt.get ('scale')] ?? 'NORMAL',
  cheermoteScale: ({ 2: '2', 3: '4' })[opt.get ('scale')] ?? '1',
  cheermoteStyle: opt.has ('static') ? 'static' : 'animated',
  cheermoteExt:   opt.has ('static') ? 'png'    : 'gif',
  request: new Request ('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', // public information
    },
  }),
};

async function getInitialAssets ()
{
  const query = { query:
`query TChatAssets($joins: [String!]!) {
  badges {
    ...badge
  }
  cheerConfig {
    displayConfig {
      colors {
        bits
        color
      }
    }
    groups {
      ...cheerGroup
    }
  }
  users(logins: $joins) {
    id
    login
    primaryColorHex
    profileImageURL(width: ${gqlConf.avatarSize})
    broadcastBadges {
      ...badge
    }
    cheer {
      cheerGroups {
        ...cheerGroup
      }
    }
  }
}
fragment badge on Badge {
  setID
  version
  imageURL(size: ${gqlConf.badgeScale})
}
fragment cheerGroup on CheermoteGroup {
  nodes {
    prefix
    tiers {
      bits
    }
  }
  templateURL
}`,
    variables: { joins: conf.joins },
  };
  const opt = { body: JSON.stringify (query) };
  try
  {
    const response = await fetch (gqlConf.request, opt);
    const json = await response.json ();
    for (const badge of json.data.badges)
      conf.badges.global[`${badge.setID}/${badge.version}`] = badge.imageURL;
    conf.cheermotes.color = json.data.cheerConfig.displayConfig.colors;
    addCheermoteGroups (json.data.cheerConfig.groups, conf.cheermotes.global);
    for (const user of json.data.users ?? [])
      if (user)
        addUserAssets (user.id, user);
  }
  catch (e)
  {
    displayError ('Failed to load Twitch badges and cheermotes', e);
  }
}

async function getChannelAssets (rid)
{
  const query = { query:
`query TChatAssets($id: ID!) {
  user(id: $id) {
    login
    primaryColorHex
    profileImageURL(width: ${gqlConf.avatarSize})
    broadcastBadges {
      setID
      version
      imageURL(size: ${gqlConf.badgeScale})
    }
    cheer {
      cheerGroups {
        nodes {
          prefix
          tiers {
            bits
          }
        }
        templateURL
      }
    }
  }
}`,
    variables: { id: rid },
  };
  const opt = { body: JSON.stringify (query) };
  try
  {
    const response = await fetch (gqlConf.request, opt);
    const json = await response.json ();
    if (json.data.user)
      addUserAssets (rid, json.data.user);
  }
  catch (e)
  {
    displayError ('Failed to load some Twitch badges or cheermotes', e);
  }
}

function addUserAssets (rid, user)
{
  conf.badges.room[rid] = {
    channel: `#${user.login}`,
    avatar: user.profileImageURL,
    primary: `#${user.primaryColorHex}`,
  };
  for (const badge of user.broadcastBadges ?? [])
    conf.badges.room[rid][`${badge.setID}/${badge.version}`] = badge.imageURL;
  if (user.cheer)
  {
    conf.cheermotes.room[rid] = { __proto__: null };
    addCheermoteGroups (user.cheer.cheerGroups, conf.cheermotes.room[rid]);
  }
}

function addCheermoteGroups (groups, dest)
{
  for (const group of groups)
    for (const node of group.nodes)
    {
      const cid = node.prefix.toLowerCase ();
      dest[cid] = {};
      for (const tier of node.tiers)
        dest[cid][tier.bits] = group.templateURL
          .replace ('PREFIX',     cid)
          .replace ('BACKGROUND', 'dark')
          .replace ('ANIMATION',  gqlConf.cheermoteStyle)
          .replace ('TIER',       tier.bits)
          .replace ('SCALE',      gqlConf.cheermoteScale)
          .replace ('EXTENSION',  gqlConf.cheermoteExt);
    }
}
