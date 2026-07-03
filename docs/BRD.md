# Business Requirements Document — Jain Temple Finder

| | |
|---|---|
| **Document owner** | Viyom Jain |
| **Status** | Living document — updated as scope evolves |
| **Last updated** | 2026-07-03 |
| **Product stage** | Early / community MVP |

## 1. Purpose

Jain Temple Finder is a free web app that helps traveling Jains locate nearby temples
(derasars) and related community places — Dadabaris, Upashrays/Sthanaks, and
Panjrapoles/Goshalas — wherever they are. The problem it solves: there is no
purpose-built, Jain-specific place-finder, and generic map apps either don't know
about these places or bury them under irrelevant results.

## 2. Background

The project started as a personal tool and is being shared with the maintainer's
Jain friends and community network. It runs entirely on free infrastructure
(static hosting + public map data APIs), reflecting its current scale and budget
(self-funded, no revenue target beyond covering incidental hosting costs).

## 3. Business Objectives

1. Make it fast and easy for a traveling Jain to find relevant places of worship
   and community institutions near any location, without needing an account or app install.
2. Grow the map's coverage over time by allowing the community itself to contribute
   places that aren't yet mapped (see §8, Roadmap).
3. Keep operating cost near-zero; any monetization exists only to offset real
   out-of-pocket costs (e.g. a custom domain), not to generate profit.

## 4. Scope

### In scope (current)
- Search by place name or device geolocation.
- Category filtering: Temple/Derasar, Dadabari, Upashray/Sthanak, Panjrapole/Goshala,
  or all combined.
- Denomination badges (Digambar / Shwetambar / Sthanakvasi) where source data has them.
- Map + distance-sorted list view of results.
- Voluntary donation link to help cover hosting/domain costs.

### In scope (planned — see Roadmap)
- Community-submitted places ("+ New" button) stored in a live database, visible
  to all users in real time, clearly marked as community-submitted (unverified)
  data distinct from OpenStreetMap data.

### Out of scope (for now)
- User accounts / login.
- Native mobile apps.
- Editorial curation or verification workflow for submissions (planned feature
  ships without a review queue — see Risks, §10).
- Trip planning, itineraries, reviews/ratings, or booking integrations.
- Paid tiers or feature paywalls.

## 5. Stakeholders

| Stakeholder | Interest |
|---|---|
| Maintainer (Viyom Jain) | Builds and operates the app; bears any hosting cost |
| End users (Jain travelers) | Want fast, accurate, relevant results with no friction |
| OpenStreetMap contributors | Source of the underlying place data; benefit from any corrections routed back to OSM |
| Future contributors | Anyone submitting a missing place via the community feature |

## 6. Target Users / Personas

- **The traveling devotee**: visiting an unfamiliar city and wants to know if
  there's a derasar or upashray nearby, ideally within walking/short-drive distance.
- **The pilgrimage planner**: researching Dadabaris or lesser-known sites ahead
  of a trip.
- **The local contributor**: knows of a temple, Panjrapole, or Upashray missing
  from the map and wants to add it without technical friction.

## 7. Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-1 | User can search by typing a place name | Done |
| FR-2 | User can search using their device's current location | Done |
| FR-3 | User can filter results by category (temple, Dadabari, Upashray, Panjrapole, or all) | Done |
| FR-4 | User can adjust search radius (5–100 km) | Done |
| FR-5 | Results show on an interactive map with category-specific icons | Done |
| FR-6 | Results list is sorted by distance and shows name, category, denomination (if known), address, distance | Done |
| FR-7 | If a category's search fails/times out, other categories still return results (graceful degradation) | Done |
| FR-8 | User can voluntarily donate via a UPI link/QR to support hosting costs | Done (UPI ID is a placeholder pending the maintainer's real ID) |
| FR-9 | User can submit a new place via a "+ New" button; it becomes visible to all users in real time | Planned — requires a Firebase project the maintainer provisions |
| FR-10 | User can get turn-by-turn directions to a result | Done |
| FR-11 | User can report a data correction, deep-linked into OpenStreetMap's own editor | Done |
| FR-12 | User can share a link to one specific place that reopens the app centered on it | Done |
| FR-13 | User can save places to a personal list (no account) and revisit them later | Done |
| FR-14 | User can look up nearby vegetarian-only restaurants or Dharamshalas from a result | Done |
| FR-15 | User can install the app to their home screen and reopen the app shell without a network round-trip | Done |
| FR-16 | User can search along a route between two or more places, not just around one point | Not yet designed — needs a routing/geometry approach decided first |
| FR-17 | A temple trust can mark their own listing as "verified" | Not yet designed — needs a real verification mechanism decided first (who grants it, how fake claims are prevented) |

## 8. Non-Functional Requirements

- **Cost**: must run on free-tier infrastructure only (GitHub Pages, public OSM APIs, Firebase free tier).
- **No login required**: any feature requiring an account is out of scope for now.
- **Availability**: best-effort; depends on third-party free services (OpenStreetMap's
  Nominatim/Overpass, GitHub Pages, Firebase) — no uptime SLA is realistic or promised.
- **Data licensing**: all map data must remain compliant with OpenStreetMap's
  [ODbL license](https://www.openstreetmap.org/copyright) (attribution shown in-app).
- **Privacy**: geolocation is used only client-side to run a search; it is never
  stored or transmitted to any server the maintainer controls.

## 9. Assumptions & Constraints

- Traffic stays small (friends/community network), so free-tier limits on
  Nominatim, Overpass, and Firebase are not expected to bind. If traffic grows
  materially, these limits (see Architecture doc) will need revisiting.
- OpenStreetMap coverage of Jain places is incomplete, especially outside major
  cities — result quality is bounded by what volunteers have mapped.
- The maintainer is the sole developer/operator; there is no dedicated ops or
  moderation team.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Community submissions (FR-9) have no review step | Spam or incorrect entries could appear immediately | Firestore security rules restrict writes to well-formed data only (valid category, coordinate bounds, no edits/deletes of others' entries); submissions are visually marked "🆕 Community" so users can judge trust; a moderation/review step can be added later if abuse occurs |
| Public free APIs (Nominatim, Overpass) rate-limit or degrade under load | Search fails or times out | Automatic single retry + smaller-radius guidance already implemented; consider self-hosting Overpass or an API key tier if usage grows |
| Placeholder UPI ID is not yet real | Donations silently fail | Maintainer needs to supply a real UPI ID (tracked as an open action item) |
| No formal data-quality control | Users may see outdated or incorrect place info | Errors can be corrected upstream in OpenStreetMap by any contributor |

## 11. Success Criteria (informal, given non-commercial scope)

- Friends/community members can find a nearby temple or related place in under
  a minute, without instructions.
- At least one real community-submitted place appears after the "+ New" feature ships.
- No incidents of the app going down due to cost (i.e., it never exceeds free-tier limits).

## 12. Roadmap

1. ~~Core search + category filters~~ — done.
2. ~~Donation button~~ — done (pending real UPI ID).
3. ~~Directions, report-a-correction, share-a-place links, saved places, nearby veg
   food/Dharamshala lookup, PWA install~~ — done.
4. Community submissions via Firebase Firestore, with "+ New" button on the map screen — in progress.
5. (Future, unscoped) Multi-stop/route search — needs a routing/geometry approach decided first.
6. (Future, unscoped) "Verified by trust" badges — needs a real verification mechanism decided
   first (who grants it, how fake claims are prevented); could tie into the monetization model
   as a legitimate paid-verification option instead of ads.
7. (Future, unscoped) Possible moderation/review queue if submission quality becomes an issue.
8. (Future, unscoped) Route corrections back into OpenStreetMap so the wider map ecosystem benefits, not just this app.

## 13. Glossary

- **Derasar**: a Jain temple.
- **Dadabari**: a shrine commemorating the footprints/memory of a Dadaguru (revered Jain monk).
- **Upashray / Sthanak**: a hall used by Jain monks/nuns and the community for study, stay, and worship (Sthanak specifically associated with the Sthanakvasi tradition).
- **Panjrapole / Goshala**: an animal shelter/sanctuary run by the Jain community, reflecting the principle of ahimsa (non-violence).
- **OSM**: OpenStreetMap, the crowdsourced open map data source this app queries.
