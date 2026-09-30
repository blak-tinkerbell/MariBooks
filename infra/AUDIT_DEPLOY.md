# Audit & Observability Stack — Deploy Guide

`infra/audit.yaml` is a **standalone** CloudFormation template (region `af-south-1`, account
`985923204885`, profile `MariBooks`). It is independent of the core `maribooks-prod` stack, so
deploying/updating/deleting it never touches the deployed app resources.

## What it creates

- **`TrailBucket`** — S3 bucket for CloudTrail logs. SSE (AES256), versioning enabled, all public
  access blocked, `DeletionPolicy: Retain` + `UpdateReplacePolicy: Retain` (delete-protected).
- **`TrailBucketPolicy`** — grants `cloudtrail.amazonaws.com` `s3:GetBucketAcl` and `s3:PutObject`
  (scoped to `AWSLogs/<account>/*` with the `bucket-owner-full-control` ACL + `aws:SourceAccount`
  conditions).
- **`Trail`** — multi-region CloudTrail, log file validation on, global service events on, logging on.
- **`AlarmTopic`** — SNS topic for alarm notifications.
- **`ApiFunctionErrorsAlarm`** — AWS/Lambda `Errors >= 1` over one 300s period (only when
  `ApiFunctionName` is provided).
- **`Api5xxAlarm`** — AWS/ApiGateway `5xx >= 5` over one 300s period (only when `HttpApiId` is
  provided).

## Parameters

| Parameter         | Default      | Notes |
|-------------------|--------------|-------|
| `AppName`         | `maribooks`  | Name prefix. |
| `Stage`           | `prod`       | `dev` or `prod`. |
| `AlarmEmail`      | `""`         | Optional. If set, an email subscription is added to the topic — **you must confirm it** via the email AWS sends. If left empty, subscribe manually afterward (see below). |
| `ApiFunctionName` | `""`         | The core stack's `ApiFunction` Lambda name. When empty, the Lambda errors alarm is skipped. |
| `HttpApiId`       | `""`         | The core stack's HTTP API ID. When empty, the 5xx alarm is skipped. |

### Getting the cross-stack values

```bash
# ApiFunctionName: the physical resource id of ApiFunction in maribooks-prod
aws cloudformation describe-stack-resource \
  --stack-name maribooks-prod --logical-resource-id ApiFunction \
  --query 'StackResourceDetail.PhysicalResourceId' --output text \
  --profile MariBooks --region af-south-1

# HttpApiId: parse it out of the ApiEndpoint output (https://<id>.execute-api...)
aws cloudformation describe-stacks --stack-name maribooks-prod \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text \
  --profile MariBooks --region af-south-1
```

## Deploy

```bash
aws cloudformation deploy \
  --template-file infra/audit.yaml \
  --stack-name maribooks-audit \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      AppName=maribooks \
      Stage=prod \
      AlarmEmail=you@example.com \
      ApiFunctionName=<ApiFunction physical name> \
      HttpApiId=<http api id> \
  --profile MariBooks \
  --region af-south-1
```

Omit any parameter override to fall back to its default (empty). With no `ApiFunctionName`/
`HttpApiId`, only the CloudTrail + bucket + SNS topic are created.

## Subscribing to alarms without `AlarmEmail`

```bash
aws sns subscribe \
  --topic-arn <AlarmTopicArn output> \
  --protocol email --notification-endpoint you@example.com \
  --profile MariBooks --region af-south-1
# then confirm via the email AWS sends
```

## Notes

- `TrailBucket` is `Retain`-protected: deleting the stack leaves the bucket (and its logs) in place.
  Empty and delete it manually if you truly want it gone.
- Validate before deploying:
  ```bash
  aws cloudformation validate-template --template-body file://infra/audit.yaml \
    --profile MariBooks --region af-south-1
  ```
