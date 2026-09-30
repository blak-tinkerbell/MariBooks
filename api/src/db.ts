/**
 * DynamoDB single-table access. Keys:
 *   PK = TENANT#<tenantId>
 *   SK = TXN#<txnId> | ORATE#<pair>#<date> | PROFILE | SHARE#<shareId>
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  BusinessProfile,
  OfficialRate,
  ShareLink,
  Transaction,
} from "@maribooks/shared";

const TABLE = process.env.TABLE_NAME as string;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const pk = (tenantId: string) => `TENANT#${tenantId}`;

export async function putTransaction(
  tenantId: string,
  txn: Transaction,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: pk(tenantId), SK: `TXN#${txn.id}`, type: "TRANSACTION", ...txn },
    }),
  );
}

export async function getTransaction(
  tenantId: string,
  id: string,
): Promise<Transaction | null> {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(tenantId), SK: `TXN#${id}` },
    }),
  );
  return res.Item ? (stripKeys(res.Item) as Transaction) : null;
}

export async function deleteTransaction(
  tenantId: string,
  id: string,
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { PK: pk(tenantId), SK: `TXN#${id}` },
    }),
  );
}

export async function listTransactions(
  tenantId: string,
): Promise<Transaction[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "TXN#" },
    }),
  );
  return (res.Items ?? []).map(stripKeys) as Transaction[];
}

export async function putOfficialRate(
  tenantId: string,
  rate: OfficialRate,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: pk(tenantId),
        SK: `ORATE#${rate.pair}#${rate.date}`,
        type: "OFFICIAL_RATE",
        ...rate,
      },
    }),
  );
}

export async function listOfficialRates(
  tenantId: string,
): Promise<OfficialRate[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "ORATE#" },
    }),
  );
  return (res.Items ?? []).map(stripKeys) as OfficialRate[];
}

export async function getProfile(
  tenantId: string,
): Promise<BusinessProfile | null> {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(tenantId), SK: "PROFILE" },
    }),
  );
  return res.Item ? (stripKeys(res.Item) as BusinessProfile) : null;
}

export async function putProfile(
  tenantId: string,
  profile: BusinessProfile,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: pk(tenantId), SK: "PROFILE", type: "PROFILE", ...profile },
    }),
  );
}

export async function putShareLink(
  tenantId: string,
  link: ShareLink,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: pk(tenantId),
        SK: `SHARE#${link.id}`,
        type: "SHARE_LINK",
        ...link,
      },
    }),
  );
}

export async function listShareLinks(
  tenantId: string,
): Promise<ShareLink[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "SHARE#" },
    }),
  );
  return (res.Items ?? []).map(stripKeys) as ShareLink[];
}

export async function getShareLink(
  tenantId: string,
  id: string,
): Promise<ShareLink | null> {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: pk(tenantId), SK: `SHARE#${id}` },
    }),
  );
  return res.Item ? (stripKeys(res.Item) as ShareLink) : null;
}

function stripKeys<T extends Record<string, unknown>>(item: T): Omit<T, "PK" | "SK" | "type"> {
  const { PK, SK, type, ...rest } = item as Record<string, unknown>;
  void PK;
  void SK;
  void type;
  return rest as Omit<T, "PK" | "SK" | "type">;
}
