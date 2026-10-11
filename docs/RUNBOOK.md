# abualraghebtires.com — Release Runbook

This repository is the live website. Nothing reaches the live site except through a reviewed pull request that passes automated checks. Every release is tagged and can be restored in one step.

## How a change goes live

1. **Branch.** Create a branch from `main` (e.g. `content/winter-prices`). Never edit `main` directly — it is protected.
2. **Build.** Edit the design source, then generate the static pages with `node _ssg/build.js <export-folder> <output-folder>`. Commit the generated files to the branch. Do not hand-edit generated HTML.
3. **Pull request.** Open a PR into `main`. The template asks what changed, which pages, and the previous release tag.
4. **CI runs automatically** (Actions → CI):

   | Check | What it guards | Blocks merge |
   |---|---|---|
   | `site-check` | One canonical per page on the live domain, EN/AR `hreflang` pairs, single JSON-LD `@graph` with the Organization node, every indexable page in `sitemap.xml` and no `noindex` page in it, `lang`/`dir="rtl"` on Arabic pages, broken internal links and assets, missing `alt`, duplicate ids, `http://` resources, `robots.txt` not blocking the site, `CNAME`, HTML and image size budgets | Yes |
   | `secrets` | Leaked API keys, tokens or private keys anywhere in the git history (gitleaks) | Yes |
   | `html-validate` | HTML structure (doctype, nesting, duplicate ids, invalid attribute values) | Yes, once calibrated (see below) |
   | `lighthouse` | SEO ≥ 90 (blocking); accessibility, performance, best practices (warnings) on 6 EN + AR pages | Yes, once calibrated |

5. **Review.** The site owner (CODEOWNERS) reviews the diff and the CI results and approves. The person who opened the PR cannot approve it.
6. **Merge.** On merge, **Deploy** runs: re-checks the site, publishes it to GitHub Pages, smoke-tests the live domain, and tags the release `release-YYYYMMDD-HHMM-<sha>`.

## Rollback (one step)

Actions → **Deploy** → **Run workflow** → in *Release tag* paste the last good tag (Code → Tags) → **Run**. The site is restored in about a minute. `main` is not changed, so fix forward with a normal PR afterwards.

## Monitoring

**Monitor** runs every morning at 07:15 (Amman): the eight key pages return 200 with the right language, canonical, schema and WhatsApp link; robots, sitemap, llms.txt, runtime and catalogue load; unknown URLs return a real 404; http redirects to https. Every Sunday it also checks outbound links (WhatsApp, Maps, brand sites). A failure emails the repository owner.

## One-time setup (owner, ~10 minutes)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.** (Custom domain stays `abualraghebtires.com`, Enforce HTTPS stays on.) Do this right before merging the CI pull request; the live site keeps serving the current version until the first Actions deploy.
2. **Settings → Rules → Rulesets → New branch ruleset**, name `main`, enforcement *Active*, target *Default branch*:
   - Restrict deletions · Block force pushes
   - Require a pull request before merging → 1 approval · Require review from Code Owners · Dismiss stale approvals when new commits are pushed
   - Require status checks to pass → add `site-check` and `secrets` · Require branches to be up to date
   - After one week of green runs, also add `html-validate` and `lighthouse`.
3. **Settings → Environments → github-pages → Deployment branches and tags:** *Selected branches and tags* → `main`.
4. Keep Cloudflare DNS records **DNS only (grey cloud)** — GitHub must be able to renew the HTTPS certificate.

## Who does what

| Role | Who | Can |
|---|---|---|
| Owner / approver | Repository owner (CODEOWNERS) | Approve and merge PRs, run rollback, change settings |
| Contributors | Web team, Claude (via a contributor account) | Branch, commit, open PRs — never merge |

## Changing the rules

The checker's settings live in `scripts/ci/site-rules.json` (domain, required files, size budgets, description length). Changing them is itself a pull request, so the rules can't be loosened silently.

## Run the checks locally

```bash
node scripts/ci/check-site.mjs .         # same gate as CI (Node 18+, no install)
SITE_ORIGIN=https://abualraghebtires.com node scripts/ci/smoke.mjs   # live smoke test
```
