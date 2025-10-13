'use strict';

const gqlConf = {
  request: new Request ('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', // public information
    },
  }),
  pagesize: 100,
};

async function getUserInfo (variables)
{
  const query = { query:
`query TLogUser($id: ID, $login: String) {
  user(id: $id, login: $login, lookupType: ALL) {
    id
    login
    displayName
    profileURL
    createdAt
    updatedAt
    deletedAt
    primaryColorHex
    small_profileImageURL: profileImageURL(width: 70)
    large_profileImageURL: profileImageURL(width: 600)
    bannerImageURL
    offlineImageURL
    description
    chatSettings { rules }
    roles {
      isAffiliate
      isExtensionsDeveloper
      isParticipatingDJ
      isPartner
      isPreAffiliate
      isSiteAdmin
      isStaff
    }
    chatColor
    displayBadges { title, imageURL(size: DOUBLE) }
    mods(first: ${gqlConf.pagesize}) {
      edges {
        cursor
        grantedAt
        node {
          id
          displayName
          profileImageURL(width: 28)
        }
      }
      pageInfo { hasNextPage }
    }
    vips(first: ${gqlConf.pagesize}) {
      edges {
        cursor
        grantedAt
        node {
          id
          displayName
          profileImageURL(width: 28)
        }
      }
      pageInfo { hasNextPage }
    }
  }
}`,
    variables,
  };
  const opt = { body: JSON.stringify (query) };
  try
  {
    const response = await fetch (gqlConf.request, opt);
    return await response.json ();
  }
  catch (e)
  {
    console.error (e);
  }
}

async function getMoreInfo (key, variables)
{
  if (key != 'mods' && key != 'vips')
    return;
  const query = { query:
`query TLogMore($id: ID!, $cursor: Cursor!) {
  user(id: $id, lookupType: ALL) {
    ${key}(first: ${gqlConf.pagesize}, after: $cursor) {
      edges {
        cursor
        grantedAt
        node {
          id
          displayName
          profileImageURL(width: 28)
        }
      }
      pageInfo { hasNextPage }
    }
  }
}`,
    variables,
  };
  const opt = { body: JSON.stringify (query) };
  try
  {
    const response = await fetch (gqlConf.request, opt);
    return await response.json ();
  }
  catch (e)
  {
    console.error (e);
  }
}
