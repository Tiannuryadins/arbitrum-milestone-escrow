#!/bin/sh
# Re-check the Arbitrum Dubai Buildathon status on the official HackQuest GraphQL API.
# No auth needed. Run every 1-2 days until registration opens.
#   REGISTER_NOT_OPEN -> still closed | REGISTER_OPEN -> registration is live, act fast
#   SUBMIT_NOT_OPEN   -> submissions closed | SUBMIT_OPEN -> submissions live
curl -s -X POST https://api.hackquest.io/graphql -H 'Content-Type: application/json' -d '{"operationName":"FindUniqueHackathon","variables":{"where":{"alias":"Arbitrum-Open-House-Dubai-Online-Buildathon"}},"query":"query FindUniqueHackathon($where: HackathonWhereUniqueInput!) { findUniqueHackathon(where: $where) { id name alias currentStatus totalRewards timeline { rewardTime } participants } }"}' | python3 -m json.tool
