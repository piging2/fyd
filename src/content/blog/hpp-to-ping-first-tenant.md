---
title: "From HPP to PING: rebuilding a website as the first TenantOS tenant"
date: "2026-09-16"
excerpt: "How a trades-company website became the proof of concept for a multi-tenant platform model, and what the transformation taught about configuration boundaries."
tags: ["tenantos", "architecture", "case-study"]
status: "published"
---

This site used to sell carpentry. Now it documents an intelligence system. The transformation between those two things is the most important thing this site demonstrates, because the transformation itself is the product thesis: a website rebuilt as the first tenant of a platform model called TenantOS.

## What TenantOS claims

The model is simple to state: platform code plus tenant configuration plus content. One codebase, many tenants. Each tenant is identity, brand, navigation, content, domain, and integrations expressed as configuration, never as a fork.

Every multi-tenant codebase eventually faces the fork temptation. A second customer wants a different brand, a different nav, different content, and the fastest path is copy the repo, edit the code, deploy. Do that three times and you have three codebases that share a name and nothing else. Every fix ships three times or not at all. TenantOS exists to make the right path the easy path: Tenant B is a new configuration file plus content, not a new repo.

## The strip

The starting point was a real, working Next.js site for a carpentry business: services pages, estimate wizard, review system, project galleries, a workbench CMS, Google Drive integration. None of that belongs in PING. The first phase was pure subtraction, done in five committed stages, each verified with a passing build:

1. Trades routes and their orphaned components
2. The workbench CMS and admin API surface
3. Google Drive integration and OAuth
4. The projection and pre-build machinery
5. Forensic and audit clutter in the repo root

Each stage built green before commit. Nothing was deleted that the build still needed; the few imports that crossed stage boundaries were fixed surgically. The result was a clean generic Next.js foundation: routes, components, Tailwind, SEO scaffolding, deployment config, and one thing worth keeping deliberately.

## The thing worth keeping

The carpentry site had a configuration authority pattern: versioned JSON files (`*.v1.json`) loaded through a typed adapter layer, with components forbidden from importing the JSON directly. Company identity, navigation, FAQ, brand assets, all of it lived in config.

That pattern is the tenant boundary. Instead of inventing a new abstraction, the transformation promoted the existing one: a `tenant.ping.v1.json` authority now owns PING's identity, tagline, brand colors, navigation, contact info, and provenance note. A typed loader validates it. Components read identity from the loader, never from hardcoded strings. The CSS design tokens were re-valued to the PING brand while keeping token names stable, so every component re-skinned without code changes. The file's own comment said it best: to re-skin for another business, change tokens only.

## The test, applied continuously

Every decision during the rebuild was checked against one question: could Tenant B use this without forking the application? The answers:

- **Identity in config, not code.** The header, footer, SEO defaults, sitemap, and contact page all resolve from the tenant authority. Pass.
- **Brand as tokens.** A second tenant changes token values and gets a different brand. Pass.
- **Content as Markdown.** Blog posts are Markdown files with frontmatter; the loader and renderer are platform code. Pass.
- **The wordmark component.** This one is honestly tenant-specific code (`ping-wordmark.tsx`). Tenant B would replace it with its own. That is acceptable: the seam is clear, and replacing one small component is not a fork.

## What is not claimed

TenantOS is a direction with one proof point, not a product. This site does not yet demonstrate Tenant B onboarding end to end, per-tenant domains at the edge, or per-tenant integrations. Those are future work. The honest label on the technology page is "Direction," and it will stay that way until the second tenant exists.

The point of the first tenant is not to be complete. It is to make the second tenant boring. If adding Tenant B is a configuration task rather than an engineering project, the model works. Everything about this rebuild was arranged to make that true.
