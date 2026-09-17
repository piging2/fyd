# PING Website

Continuity infrastructure for AI agents and the businesses they serve.

This is the public website for PING, the first tenant of the TenantOS platform model.

## Architecture

- **Framework:** Next.js 15 + React 18 + Tailwind CSS
- **Tenant config:** `src/config/tenant.ping.v1.json` is the identity authority
- **Content:** Static generation for all public routes
- **API seam:** `src/lib/ping-api.ts` defines the interface to the PING API (unconnected)

## Development

```bash
npm install
npm run dev
```

## Deployment

Vercel project connected to this repository. Push to `main` deploys to production.

## Provenance

Select components and design patterns were harvested from Happy Place Platform
(HPP) as source archaeology. PING is an independent product with its own
repository, history, credentials, and deployment lifecycle. HPP is not a
dependency, upstream, or remote of this repository.
