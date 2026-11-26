# Production hosting (ADR 0005)

Two parts, from issue #34:

- `infra/`: every AWS resource, in CDK v2. `PrayerTeamData` holds the VPC, RDS, the certificate and the SES identity, and is termination protected. `PrayerTeamApp` holds the instance, ECR, the web bucket, CloudFront, the GitHub deploy role, logs and patching.
- `deploy/` (this folder): the files that run on the API instance. They are uploaded to the deploy bucket on every deploy and copied to `/opt/prayerteam/` by the deploy SSM document, which then runs `deploy.sh <sha>`.

```
infra:   pnpm --filter @prayerteam/infra test         # CDK assertions, no AWS access
         pnpm --filter @prayerteam/infra check-types
         pnpm --filter @prayerteam/infra cdk synth -c domain=… -c originDomain=… -c hostedZoneId=… -c hostedZoneName=…
```

Put `domain`, `originDomain`, `hostedZoneId` and `hostedZoneName` in `infra/cdk.json` once the domain is chosen.

## The server image contract

`deploy.sh` and `compose.yaml` expect this from the `apps/server` image (#31, #32, rest of #34):

| | |
|---|---|
| Commands | `serve` (default) starts the server with the job runner on. `migrate` applies Drizzle migrations, then the pg-boss schema, and exits non-zero on failure. |
| Port | Listens on `$PORT` (3000) inside the container. Nothing publishes it. |
| Readiness | `GET /api/health/ready` gives 200 only when the database answers and the job runner has started. `deploy.sh` probes it with `node -e fetch(...)` inside the container, so the image must have `node` on `PATH`. |
| Shutdown | On SIGTERM, finish in-flight requests and jobs in under 40 s (`stop_grace_period`). |
| Environment | `NODE_ENV=production`, `AWS_REGION`, `SSM_PREFIX` (`/prayerteam/prod`), `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_SECRET_ARN` (RDS-managed secret holding `username` and `password`). Secrets and minimum versions come from SSM under `SSM_PREFIX`. |
| Client IP | Requests pass through two proxies: CloudFront, then Caddy. Both append to `X-Forwarded-For`, so set Fastify's `trustProxy: 2`. The client IP is then the entry CloudFront wrote, not whatever the client sent first. |
| Memory | Each slot is capped at 320 MB, with `--max-old-space-size=224`. |

## First deploy (manual, once)

1. Create these by hand. CloudFormation can't create `SecureString`s.
   - `SecureString`s: `/prayerteam/prod/better-auth-secret`, `/prayerteam/prod/expo-access-token`, `/prayerteam/prod/vapid-public-key`, `/prayerteam/prod/vapid-private-key`.
   - `String`: `/prayerteam/prod/cloudfront-origin-secret`, for example `openssl rand -hex 32`. This one is a plain `String` because CloudFormation can't resolve `ssm-secure` references in CloudFront properties. The value is visible in the distribution's config anyway.
2. `cdk bootstrap aws://<account>/us-east-1`, then `cdk deploy --all` with admin credentials. This creates the GitHub OIDC provider and the `prayerteam-github-deploy` role. It fails if the account already has a GitHub OIDC provider; import or remove that one first.
3. Confirm the ACM certificate validated and the SES DKIM records verified.
4. Run the first `deploy.sh` (the deploy workflow, or `aws ssm send-command` with the deploy document and a pushed SHA).
5. Load the web domain on a phone and a desktop, and sign in once through CloudFront.
6. Check that a Session Manager shell works, and that SSH (port 22) is refused.
7. Switch the CloudFront distribution to the flat-rate free plan in the console. CDK can't set it, so the stack creates it on the standard pay-as-you-go plan.

## Deploying and rolling back

`deploy.sh <sha>` runs blue/green on one box: migrate, start the idle slot, wait for readiness, reload Caddy, then stop the old slot. Any failure before the Caddy switch leaves the old slot serving, and the script exits non-zero. Rollback is `deploy.sh <previous-sha>`. On-instance state (the active slot, each slot's image, `upstream.caddy` and `server.env`) lives in `/opt/prayerteam/state/`, which the deploy file copy never touches.

## Logs

Containers log through Docker's `awslogs` driver to `/prayerteam/prod/containers`, one stream per container. `docker logs` still works through Docker's local cache. The CloudWatch agent ships system logs to `/prayerteam/prod/system`. Both log groups keep 14 days.
