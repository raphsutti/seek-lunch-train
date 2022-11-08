import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { add, getUnixTime } from "date-fns";

import { z } from "zod";

const DYNAMO_TABLE = "seek-lunch-train";

const Participant = z.object({
  userId: z.string(),
  userJoinedMessageId: z.string(),
  reminderScheduledMessageId: z.string(),
  readyToDepart: z.boolean(),
});

export const LunchTrainZod = z.object({
  creatorId: z.string(),
  trainId: z.string(),
  lunchDestination: z.string(),
  meetLocation: z.string(),

  // UTC format
  leavingAt: z.string(),
  participants: z.array(Participant),
  // TimeStamp identifies the message for updating
  trainCreatedPostTimeStamp: z.string(),
  creatorReminderScheduledMessageId: z.string(),
});

export type LunchTrain = z.infer<typeof LunchTrainZod>;

export interface LunchTrainRecord extends LunchTrain {
  ttl: string;
}

const client = new DocumentClient({ region: "ap-southeast-2" });

export const putDynamoItem = async (data: LunchTrain) => {
  const oneWeekAfterTrainLeft = getUnixTime(
    add(new Date(data.leavingAt), { days: 2 })
  );
  const params = {
    TableName: DYNAMO_TABLE,
    Item: {
      ...data,
      ttl: oneWeekAfterTrainLeft,
    },
    ReturnConsumedCapacity: "TOTAL",
  };

  await client
    .put(params, function (err, data) {
      if (err) console.log(err);
      else console.log(data);
    })
    .promise();
};

export const queryDynamo = async (input: {
  creatorId: string;
  trainId: string;
}) => {
  const params = {
    TableName: DYNAMO_TABLE,
    KeyConditionExpression: "#creatorId = :hkey and #trainId = :rkey",
    ExpressionAttributeValues: {
      ":hkey": input.creatorId,
      ":rkey": input.trainId,
    },
    ExpressionAttributeNames: {
      "#creatorId": "creatorId",
      "#trainId": "trainId",
    },
  };

  const { Items } = await client.query(params).promise();

  return Items ? (Items[0] as LunchTrainRecord) : undefined;
};

export const queryAllTrainsByCreator = async (input: { creatorId: string }) => {
  const params = {
    TableName: DYNAMO_TABLE,
    KeyConditionExpression: "#creatorId = :hkey",
    ExpressionAttributeValues: {
      ":hkey": input.creatorId,
    },
    ExpressionAttributeNames: {
      "#creatorId": "creatorId",
    },
  };

  const { Items } = await client.query(params).promise();

  return Items ? (Items as LunchTrainRecord[]) : undefined;
};

export const deleteItemDynamo = (input: {
  creatorId: string;
  trainId: string;
}) => {
  const params = {
    TableName: DYNAMO_TABLE,
    Key: {
      creatorId: input.creatorId,
      trainId: input.trainId,
    },
  };

  return client.delete(params).promise();
};
