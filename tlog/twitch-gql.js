'use strict';

const gqlConf = {
  request: new Request ('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-ID': 'kd1unb4b3q4t58fwlpcbzcbnm76a8fp',
    },
  }),
};

async function gqlQuery (query, variables)
{
  const opt = { body: JSON.stringify ({ query, variables }) };
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

function gql (strings, ...values)
{
  const query = String.raw ({ raw: strings }, ...values);
  return variables => gqlQuery (query.trim (), variables);
}

gqlConf.fragmentUser = `fragment user on User {
  id
  login
  displayName
  profileImageURL(width: 28)
}`;

gqlConf.fragmentBadge = `fragment badge on Badge {
  setID
  version
  title
  description
  imageURL(size: $size)
}`;

gqlConf.fragmentPred = `fragment prediction on PredictionEvent {
  status
  createdAt
  createdBy { ...actor }
  lockedAt
  lockedBy { ...actor }
  predictionWindowSeconds
  endedAt
  endedBy { ...actor }
  title
  outcomes {
    id
    title
    badge {
      title
      imageURL(size: NORMAL)
    }
    totalPoints
    totalUsers
    topPredictors {
      points
      pointsWon
      predictedAt
      user { ...user }
    }
  }
  winningOutcome { id }
}`;

gqlConf.fragmentActor = `fragment actor on PredictionEventActor {
  __typename
  ... on ExtensionClient {
    name
    organization {
      name
      url
    }
  }
  ...user
}`;

gqlConf.fragmentFF = `fragment follower on FollowerConnection {
  edges {
    cursor
    followedAt
    node { ...user }
  }
  pageInfo { hasNextPage }
}
fragment follow on FollowConnection {
  edges {
    cursor
    followedAt
    node { ...user }
  }
  pageInfo { hasNextPage }
}`;

const getUserInfo = gql`
query TLogUser($id: ID, $login: String, $size: BadgeImageSize = NORMAL) {
  user(id: $id, login: $login, lookupType: ALL) {
    id
    login
    displayName
    profileURL
    createdAt
    updatedAt
    deletedAt
    followers(first: 1) { totalCount }
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
    primaryTeam {
      name
      displayName
      owner { ...user }
    }
    mods(first: 100) {
      edges {
        cursor
        grantedAt
        node {
          ...user
          displayBadges(channelID: $id, channelLogin: $login) {
            ...badge
          }
        }
      }
      pageInfo { hasNextPage }
    }
    vips(first: 100) {
      edges {
        grantedAt
        node { ...user }
      }
      pageInfo { hasNextPage }
    }
    lastBroadcast {
      startedAt
      game {
        slug
        displayName
      }
      title
    }
    channel {
      displayName
      activePredictionEvents { __typename }
      lockedPredictionEvents { __typename }
      resolvedPredictionEvents(first: 25) {
        edges {
          node { __typename }
        }
        pageInfo { hasNextPage }
      }
      founderBadgeAvailability
      founders {
        entitlementStart
        isSubscribed
        user { ...user }
      }
    }
    broadcastSettings {
      liveUpNotificationInfo {
        isDefault
        liveUpNotification
      }
    }
    stream {
      viewersCount
      clipCount
    }
  }
}
${gqlConf.fragmentUser}
${gqlConf.fragmentBadge}
`;

const getMoreMods = gql`
query TLogMods($id: ID!, $cursor: Cursor!, $size: BadgeImageSize = NORMAL) {
  user(id: $id, lookupType: ALL) {
    mods(first: 100, after: $cursor) {
      edges {
        cursor
        grantedAt
        node {
          ...user
          displayBadges(channelID: $id) {
            ...badge
          }
        }
      }
      pageInfo { hasNextPage }
    }
  }
}
${gqlConf.fragmentUser}
${gqlConf.fragmentBadge}
`;

const getUserBadges = gql`
query TLogBadges($login: String!, $size: BadgeImageSize = DOUBLE) {
  channelViewer(userLogin: $login, channelLogin: $login) {
    earnedBadges { ...badge }
  }
}
${gqlConf.fragmentBadge}
`;

const getFollowInfo = gql`
query TLogFollow($id: ID!) {
  user(id: $id, lookupType: ALL) {
    followedGames {
      nodes {
        slug
        displayName
      }
    }
    asc_followers: followers(first: 100, order: ASC) { ...follower }
    desc_followers: followers(first: 100, order: DESC) { ...follower }
    follows(first: 1) { totalCount }
    asc_follows: follows(first: 100, order: ASC) { ...follow }
    desc_follows: follows(first: 100, order: DESC) { ...follow }
  }
}
${gqlConf.fragmentFF}
${gqlConf.fragmentUser}
`;

const getFollowMore = gql`
query TLogFollow(
  $id: ID!, $cursor: Cursor!
  $asc_followers: Boolean!, $desc_followers: Boolean!
  $asc_follows: Boolean!, $desc_follows: Boolean!
) {
  user(id: $id, lookupType: ALL) {
    asc_followers: followers(first: 100, order: ASC, after: $cursor)
      @include(if: $asc_followers) { ...follower }
    desc_followers: followers(first: 100, order: DESC, after: $cursor)
      @include(if: $desc_followers) { ...follower }
    asc_follows: follows(first: 100, order: ASC, after: $cursor)
      @include(if: $asc_follows) { ...follow }
    desc_follows: follows(first: 100, order: DESC, after: $cursor)
      @include(if: $desc_follows) { ...follow }
  }
}
${gqlConf.fragmentFF}
${gqlConf.fragmentUser}
`;

const getPredInfo = gql`
query TLogPred($id: ID!) {
  channel(id: $id) {
    activePredictionEvents { ...prediction }
    lockedPredictionEvents { ...prediction }
    resolvedPredictionEvents {
      edges {
        cursor
        node { ...prediction }
      }
      pageInfo { hasNextPage }
    }
  }
}
${gqlConf.fragmentPred}
${gqlConf.fragmentActor}
${gqlConf.fragmentUser}
`;

const getPredMore = gql`
query TLogPred($id: ID!, $cursor: Cursor!) {
  channel(id: $id) {
    resolvedPredictionEvents(after: $cursor) {
      edges {
        cursor
        node { ...prediction }
      }
      pageInfo { hasNextPage }
    }
  }
}
${gqlConf.fragmentPred}
${gqlConf.fragmentActor}
${gqlConf.fragmentUser}
`;

const getUserError = gql`
query TLogUserError($id: ID!) {
  userResultByID(id: $id) {
    __typename
    ... on UserDoesNotExist {
      reason
    }
  }
}`;

const getTeamInfo = gql`
query TLogTeam($name: String!) {
  team(name: $name) {
    id
    name
    displayName
    backgroundImageURL
    bannerURL
    logoURL
    description
    owner { ...user }
    members(first: 100) {
      totalCount
      edges {
        cursor
        node {
          ...user
          primaryTeam { id }
        }
      }
      pageInfo { hasNextPage }
    }
  }
}
${gqlConf.fragmentUser}
`;

const getTeamMore = gql`
query TLogTeam($name: String!, $cursor: Cursor!) {
  team(name: $name) {
    members(first: 100, after: $cursor) {
      edges {
        cursor
        node { ...user }
      }
      pageInfo { hasNextPage }
    }
  }
}
${gqlConf.fragmentUser}
`;
