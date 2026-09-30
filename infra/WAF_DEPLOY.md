# WAF Deployment (two-step)

CloudFront-scope WAFv2 WebACLs **must** live in `us-east-1`, while the MariBooks
hosting stack (`maribooks-hosting`) runs in `af-south-1`. So the WebACL is a
separate stack. Deploy it first, grab its output ARN, then update the hosting
stack to associate it.

Existing hosting stack: `maribooks-hosting` (af-south-1)
Existing CloudFront distribution id: `E1QN9VIES8PZAU`

## Step 1 — Deploy the WAF stack to us-east-1

```bash
aws cloudformation deploy \
  --template-file infra/waf.yaml \
  --stack-name maribooks-waf \
  --profile MariBooks \
  --region us-east-1
```

Get the WebACL ARN output:

```bash
aws cloudformation describe-stacks \
  --stack-name maribooks-waf \
  --profile MariBooks \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='WebAclArn'].OutputValue" \
  --output text
```

## Step 2 — Update the hosting stack in af-south-1 with the ARN

Pass the ARN from Step 1 into the `WebAclArn` parameter. This sets
`Distribution.DistributionConfig.WebACLId` and associates the WebACL with the
CloudFront distribution.

```bash
aws cloudformation deploy \
  --template-file infra/hosting.yaml \
  --stack-name maribooks-hosting \
  --profile MariBooks \
  --region af-south-1 \
  --parameter-overrides WebAclArn=<arn-from-step-1>
```

> Note: When re-deploying the hosting stack without a WAF, pass
> `WebAclArn=""` (or omit the override if the current value is empty) to leave
> the distribution unassociated. An empty `WebACLId` disables the association.
