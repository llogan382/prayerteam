# AWS hosting options for a solo-run TS API and Postgres

Research for [#5](https://github.com/llogan382/prayerteam/issues/5). Gathered 2026-11-25 from official AWS pricing pages, AWS docs, and SST/CDK/Terraform docs. This file states facts and trade-offs only. The choices belong to [#11](https://github.com/llogan382/prayerteam/issues/11) (auth) and [#12](https://github.com/llogan382/prayerteam/issues/12) (AWS architecture).

All prices are on-demand, **US East (N. Virginia)**, in USD. A month is taken as 730 hours. "Small scale" means a few Churches: hundreds of Members and well under 1M API requests a month.

## TL;DR

- **App Runner is out.** AWS closed it to new customers on 2026-04-30 and points new users to **ECS Express Mode** (Fargate + ALB). [1]
- **The always-on floor is set by Postgres and networking, not by compute.** RDS `db.t4g.micro` Single-AZ plus 20 GB gp3 costs about **$14/mo**. Lambda at this scale fits in the free allowance. Fargate behind an ALB costs about **$30+/mo** before the database.
- **Lambda + Postgres has two hidden costs.** (a) Connection pooling: AWS recommends **RDS Proxy** (about $22/mo minimum on RDS, about $88/mo on Aurora Serverless). (b) A Lambda in a VPC has **no internet egress without NAT**, and the app needs egress for push and email. A managed NAT gateway costs about $33/mo per AZ. [6][13][14]
- **Aurora Serverless v2 can now scale to 0 ACU (auto-pause).** Resume takes about 15 s, or 30 s+ after 24 h idle. An attached **RDS Proxy prevents pausing**. Kept always on at the 0.5 ACU minimum it costs about $44/mo plus storage. [4][5]
- **Web hosting is almost free either way.** The CloudFront flat-rate **Free plan** costs $0 (1M requests, 100 GB, 5 GB S3). Amplify Hosting's free tier lasts 12 months, then it is pay-per-GB. [9][10]
- **Cognito handles identity, not authorization.** It covers sign-up, verification, reset, MFA, and JWTs, with 10k MAU free on Lite/Essentials. Production email needs **SES**, because the default sender is capped at **50 emails/day**. Church/Team/Admin roles still live in Postgres. Password hashes **cannot be exported** if you leave. [11][12][17]
- **IaC.** SST is TypeScript on Pulumi, with high-level `Postgres`/`Aurora`/`Vpc` components, cost notes, and `sst dev`. CDK is TypeScript on CloudFormation and is AWS-maintained. Terraform is HCL and needs remote state (an S3 backend). [15][16][18][19]

## 1. API compute

| Option | Pricing | Idle floor | Cold start | Ops load |
|---|---|---|---|---|
| **Lambda** (+ API Gateway HTTP API) | $0.20 per 1M requests, $0.0000166667 per GB-s (x86). Free allowance of 1M requests + 400,000 GB-s/mo [2]. HTTP API $1.00 per 1M requests, with a 12-month free tier of 1M calls [8] | ~$0 | Yes. "Cold starts typically occur in under 1% of invocations… from under 100 ms to over 1 second". Init is billed. Provisioned Concurrency removes them at extra cost [2][7] | Lowest: no servers or patching. Must handle DB connections and VPC egress (see §3) |
| **ECS Fargate** (via ECS Express Mode or a hand-built service) | x86 $0.0404784/vCPU-h + $0.004446/GB-h. ARM $0.03237984/vCPU-h + $0.00356004/GB-h. Per-second billing, 1-min minimum. Smallest task 0.25 vCPU / 0.5 GB [3] | One 0.25/0.5 ARM task ≈ **$7.2/mo**; x86 ≈ **$9.0/mo**. Plus ALB ≈ $16.4/mo ($0.0225/h) + LCU ($0.008/LCU-h) [3][20] | None: a long-running Node process with an ordinary `pg` pool | Medium: container image, ECR, task sizing, ALB, health checks. Express Mode provisions Fargate service + ALB + autoscaling from one API call, at no extra charge beyond the resources; one ALB is shared across up to 25 services [1][21] |
| **App Runner** | $0.064/vCPU-h active, $0.007/GB-h [22] | — | — | **Closed to new customers since 2026-04-30.** No new features planned [1] |

Notes:
- Lambda's pricing page states the 1M requests / 400,000 GB-s allowance. The page I read does not say whether it is always free or limited to 12 months. AWS's new-account Free Tier (up to $200 credits over 6 months, Free vs Paid plan) also does not list per-service always-free amounts. [2][23] **Unverified:** check the Lambda free-tier status in the console before relying on it.
- Worked example: 300k requests/mo × 150 ms × 512 MB = 22,500 GB-s, which is about 6% of the free allowance. HTTP API cost would be $0.30/mo after the 12-month free tier.
- Fargate tasks also need egress. In a public subnet with a public IP there is no NAT, but each public IPv4 costs $0.005/h (≈ $3.65/mo). [13]

## 2. Postgres

| Option | Price | Monthly at small scale | Notes |
|---|---|---|---|
| **RDS for PostgreSQL** `db.t4g.micro` | $0.016/h Single-AZ, $0.032/h Multi-AZ [24] | Single-AZ ≈ $11.7 + 20 GB gp3 ($0.115/GB-mo) ≈ **$14**. Multi-AZ ≈ $23.4 + 20 GB ($0.23/GB-mo) ≈ **$28** [24] | SST's `Postgres` component defaults to exactly this setup and quotes ~$14/mo [15]. Burstable: CPU credits beyond baseline cost $0.075/vCPU-h [25] |
| RDS `db.t4g.small` / `db.t4g.medium` | $0.032 / $0.065/h Single-AZ. $0.065 / $0.129/h Multi-AZ [24] | ≈ $23 / $47 + storage (Single-AZ) | Growth headroom |
| **Aurora Serverless v2** (PostgreSQL) | $0.12/ACU-h (Standard), $0.10/GB-mo storage, $0.20 per 1M I/Os. I/O-Optimized: $0.156/ACU-h, $0.225/GB-mo, $0 I/O [4] | Always on at the 0.5 ACU minimum ≈ **$43.8** + storage + I/O. With auto-pause (min 0 ACU), compute is $0 while paused and only storage is charged [4][5] | Auto-pause needs Aurora PostgreSQL ≥ 16.3/15.7/14.12/13.15. Resume "approximately 15 seconds", "30 seconds or longer" after >24 h paused. Clients need retry logic. Any open user connection, or an **RDS Proxy**, prevents pausing. `pg_cron` jobs don't wake it and are skipped [5] |
| RDS backups | Snapshot storage $0.095/GB-mo beyond free allocation [24] | — | Relevant to "Backups and DR" in #1's Not-yet-specified list |

Notes:
- New accounts get up to $200 in credits over 6 months. The RDS page also mentions 12 months of 750 Single-AZ instance-hours + 20 GB for Free Tier accounts. [23][25] Neither applies after the first months, so the figures above are the steady state.
- `pg_cron` caveat: Church-wide **auto-archive** could be implemented as a DB cron. On a paused Aurora instance those jobs are skipped. [5]

## 3. Connection pooling and VPC egress (the Lambda tax)

- AWS: "Direct connections are useful in simple scenarios, and proxies are recommended for production… a database proxy… enables your function to reach high concurrency levels without exhausting database connections." The function "must be in the same Amazon VPC where your database runs." [6]
- **RDS Proxy price**: $0.015 per vCPU-hour for provisioned instances (minimum 2 vCPU) and per ACU-hour for Aurora Serverless (minimum 8 ACU). There is a 10-minute minimum after a billable status change. [26][27] So: on `db.t4g.micro` (2 vCPU) ≈ **$21.9/mo**, which SST quotes as "roughly $22/month" [15]. On Aurora Serverless ≈ **$87.6/mo**, which SST quotes as ~$86 [16]. The minimums come from an AWS Database Blog post and the SST docs. The official pricing page states the units but not the minimums.
- Alternatives to Proxy: at a few Churches, Lambda concurrency will be low, and reusing one connection per execution environment is AWS-documented practice ("objects declared outside of the function's handler… remain initialized… the original connection is used in subsequent invocations"). [7] **RDS Data API** (HTTP, no persistent connections) exists for Aurora at $0.35 per 1M requests, per SST. [16]
- **Egress**: "Connecting a function to a public subnet doesn't give it internet access". Private subnets reach the internet through a NAT gateway. [14] The app needs egress to send push notifications (APNs/FCM or a push relay) and probably to call SES. Costs:
  - Managed NAT gateway: $0.045/h + $0.045/GB [13] ≈ **$33/mo per AZ**. SST quotes a ~$65/mo minimum for 2 AZs. [18]
  - SST `nat: "ec2"` (fck-nat on `t4g.nano`): about **$6/mo for 2 AZs**, but you scale it yourself. [18]
  - VPC interface endpoints for specific AWS services (e.g. SES) avoid NAT for those services. I did not verify their price here.
- Fargate and long-running containers avoid the pooling problem, because a single process holds a normal pool. They still need egress (public IP or NAT).

## 4. Web hosting (React Native web build = static SPA)

| Option | Pricing | Notes |
|---|---|---|
| **S3 + CloudFront** | Flat-rate **Free plan, $0/mo**: 1M requests, 100 GB transfer, 5 GB S3 storage, Route 53 DNS, DDoS protection; no logging/SLA. **Pro $15/mo**: 10M requests, 50 TB, logging, more WAF rules. Pay-as-you-go also exists [9] | You configure the bucket, OAC, distribution, and SPA fallback yourself, or let IaC do it (e.g. SST `StaticSite`). Flat-rate plans can't be combined with other offers [9] |
| **Amplify Hosting** | Free for 12 months: 1,000 build-min, 5 GB storage, 15 GB transfer. After that: $0.01/build-min, $0.023/GB-mo storage, $0.15/GB out [10] | Git-connected builds and previews, managed for you. At this traffic it costs a few dollars a month or less |

## 5. Cognito for email + password

**What it gives** [11][12]:
- User pool with username/email + password, password policy, email verification, forgot-password, admin-created users with invitation, MFA (TOTP/SMS; email OTP on Essentials+), and JWT access/ID/refresh tokens.
- Tiers: **Lite** and **Essentials** include 10,000 MAU free per account. Above that, Essentials costs $0.015/MAU and Lite is tiered from $0.0055/MAU. **Plus** costs $0.020/MAU with no free tier and adds threat protection: compromised-credential detection and adaptive auth. Essentials adds the managed-login visual editor, passwordless (passkeys, email/SMS OTP), password-reuse prevention, and refresh-token rotation. [11]
- Bulk import of users, now including bcrypt/scrypt/argon2id/PBKDF2 hashes. [17]

**What it does not give, or where it bites**:
- **Email volume**: the default Cognito sender is limited to **50 emails per day per account** ("For typical production environments, the default email limit is below the required delivery volume"). For production you configure **your own SES**: a verified domain, and the account moved out of the SES sandbox. SES charges per message. [12][28]
- **Authorization / domain model**: Church, Team, Church Admin, Platform Admin, Block, and Report rules are application data in Postgres. Cognito only gives a stable `sub` to link the users table to. (Cognito groups exist but are not a substitute for per-Church, per-Team roles.) *My inference, not a doc quote.*
- **Exit cost**: Cognito does not let you export password hashes. Moving off it means forced password resets or a just-in-time migration through the old pool. The `sub` is not portable between pools. [17][29]
- **Invite Link flow**: joining via Invite Link → default Team is app logic, e.g. a pre/post sign-up Lambda trigger or an API call after confirmation. Cognito has no built-in concept for it.
- **The alternative to compare in #11**: self-managed auth in the TS API (argon2/bcrypt hashes in Postgres + SES for email). It has no MAU cost and no lock-in, but you own reset, verification, rate-limiting, and session security.

## 6. Infrastructure as code

| Tool | What it is | Solo-dev relevance |
|---|---|---|
| **SST (v3)** | TypeScript config (`sst.config.ts`); "SST uses Pulumi behind the scenes for the providers and the deployment engine". Open source; no Pulumi account needed; state stays in your AWS account [19] | High-level components: `Postgres` (RDS, `proxy` flag, `dev` → local Postgres) [15], `Aurora` (min 0 ACU auto-pause, `proxy`, `dataApi`) [16], `Vpc` (`nat: "managed"|"ec2"`, `bastion`) [18], plus Function, Cluster/Service, and static sites. `sst dev` runs functions live and tunnels into the VPC [19]. Component docs include cost estimates |
| **AWS CDK** | Open-source TS/JS/Python/Java/C#/Go libraries that deploy "through AWS CloudFormation" [30] | AWS-maintained; L2/L3 constructs (e.g. `ApplicationLoadBalancedFargateService`). CloudFormation gives rollback-on-error. More verbose than SST for the same stack [30] |
| **Terraform** | HCL; state is a local file by default; remote backends such as S3 support locking [31] | Most portable and widely used. You manage the state backend, and it isn't TypeScript |

Discrepancy noted: SST's Aurora page lists storage at "$0.01 per GB-month". AWS's Aurora pricing page says **$0.10** (Standard). Trust AWS. [4][16]

## 7. Rough monthly totals (steady state, after free credits; excluding SES, domain, push service)

| Shape | Components | ≈ $/mo |
|---|---|---|
| A. Lambda + RDS micro, no Proxy, ec2-NAT | HTTP API + Lambda (~$0–1) + RDS t4g.micro Single-AZ 20 GB ($14) + fck-nat 2 AZ ($6) + CloudFront Free ($0) + Cognito ≤10k MAU ($0) | **~$20** |
| B. Lambda + RDS micro + RDS Proxy + managed NAT (AWS-recommended production pattern) | A − fck-nat + Proxy ($22) + managed NAT 1–2 AZ ($33–65) | **~$70–100** |
| C. Lambda + Aurora Serverless v2 auto-pause | Lambda (~$0–1) + Aurora storage (~$2) + ACU only while active + NAT. No Proxy, which would block pause | **~$10–50**, depending on how often it wakes; ~15–30 s first-request latency after idle |
| D. Fargate (Express Mode) + RDS micro | 1× 0.25/0.5 ARM task ($7) + ALB (~$22 incl. 1 LCU) + public IPv4s (~$7) + RDS ($14) | **~$50**; ~$57 with 2 tasks |
| E. D with Multi-AZ RDS and 2 tasks | — | **~$70** |

These are arithmetic on the cited unit prices and are not calculator-verified. CloudWatch Logs, Secrets Manager, ECR storage, and data transfer are small but non-zero, and they are excluded.

## Open questions surfaced

1. **Push notification delivery path** (APNs/FCM direct vs Expo push vs SNS) decides whether VPC egress is required, and so whether NAT is needed.
2. **Transactional email**: SES domain and sandbox exit are needed whether or not Cognito is chosen. This overlaps #1's "Transactional email sending domain".
3. **Auto-archive scheduler**: `pg_cron` vs EventBridge Scheduler → Lambda. This matters if Aurora auto-pause is used.
4. **Backups/DR**: RDS automated backup retention and snapshot cost. #1 lists this as not yet specified.
5. **Single region and single AZ acceptable for v1?** This drives Multi-AZ (×2 DB cost) and NAT-per-AZ.
6. **Lambda free-tier permanence** under the post-2025 Free Tier model was not confirmed from a primary source.

## Sources

1. AWS App Runner availability change — https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
2. AWS Lambda pricing — https://aws.amazon.com/lambda/pricing/
3. AWS Fargate pricing — https://aws.amazon.com/fargate/pricing/
4. Amazon Aurora pricing — https://aws.amazon.com/rds/aurora/pricing/
5. Aurora Serverless v2 auto-pause — https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html
6. Using Lambda with Amazon RDS — https://docs.aws.amazon.com/lambda/latest/dg/configuration-database.html
7. Lambda execution environment lifecycle (cold starts) — https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html
8. API Gateway pricing — https://aws.amazon.com/api-gateway/pricing/
9. CloudFront pricing (flat-rate plans) — https://aws.amazon.com/cloudfront/pricing/
10. Amplify pricing — https://aws.amazon.com/amplify/pricing/
11. Cognito pricing — https://aws.amazon.com/cognito/pricing/
12. Cognito email settings — https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html
13. Amazon VPC pricing (public IPv4, NAT gateway) — https://aws.amazon.com/vpc/pricing/
14. Internet access for VPC-connected Lambda — https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html
15. SST `aws.Postgres` — https://sst.dev/docs/component/aws/postgres/
16. SST `aws.Aurora` — https://sst.dev/docs/component/aws/aurora/
17. Cognito user import (CSV, password hashes) — https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html
18. SST `aws.Vpc` — https://sst.dev/docs/component/aws/vpc/
19. SST docs overview — https://sst.dev/docs/
20. Elastic Load Balancing pricing — https://aws.amazon.com/elasticloadbalancing/pricing/
21. Amazon ECS Express Mode — https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
22. App Runner pricing — https://aws.amazon.com/apprunner/pricing/
23. AWS Free Tier — https://aws.amazon.com/free/
24. RDS for PostgreSQL on-demand price data used by the AWS pricing page (us-east-1) — https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/rds/USD/current/rds-postgresql-ondemand.json
25. RDS for PostgreSQL pricing — https://aws.amazon.com/rds/postgresql/pricing/
26. RDS Proxy pricing — https://aws.amazon.com/rds/proxy/pricing/
27. AWS Database Blog, PgBouncer vs RDS Proxy (states 2 vCPU / 8 ACU minimums) — https://aws.amazon.com/blogs/database/understanding-the-differences-between-pgbouncer-and-amazon-rds-proxy-for-postgresql-connection-pooling/
28. Cognito quotas (50 emails/day default) — https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html
29. AWS Security Blog, approaches for migrating users to Cognito — https://aws.amazon.com/blogs/security/approaches-for-migrating-users-to-amazon-cognito-user-pools/
30. What is the AWS CDK — https://docs.aws.amazon.com/cdk/v2/guide/home.html
31. Terraform remote state — https://developer.hashicorp.com/terraform/language/state/remote
