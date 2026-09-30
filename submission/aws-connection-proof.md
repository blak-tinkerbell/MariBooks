# Coding-agent → AWS connection proof

Captured: 2026-09-30T21:56:47Z
Region: af-south-1
Auth: AWS IAM Identity Center (SSO), profile MariBooks, role AWSAdministratorAccess

```
$ aws sts get-caller-identity --profile MariBooks
{
    "UserId": "AROA6LDM2G4K6RBLR2XEH:tari",
    "Account": "985923204885",
    "Arn": "arn:aws:sts::985923204885:assumed-role/AWSReservedSSO_AWSAdministratorAccess_292b7e3f15db9d32/tari"
}
```
