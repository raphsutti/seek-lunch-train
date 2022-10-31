import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { add, getUnixTime } from "date-fns";

const DYNAMO_TABLE = "seek-lunch-train";

interface Participant {
  userId: string;
  reminderScheduledMessageId: string;
  // For future roll call feature
  readyToDepart: boolean;
}
export interface LunchTrain {
  creatorId: string;
  trainId: string;
  lunchDestination: string;
  meetLocation: string;

  // UTC format
  leavingAt: string;
  participants: Participant[];
  // TimeStamp identifies the message for updating
  trainCreatedPostTimeStamp: string;
  creatorReminderScheduledMessageId: string;
}

export interface LunchTrainRecord extends LunchTrain {
  ttl: string;
}

const client = new DocumentClient({ region: "ap-southeast-2" });

export const putDynamoItem = (data: LunchTrain) => {
  const oneWeekAfterTrainLeft = getUnixTime(
    add(new Date(data.leavingAt), { days: 7 })
  );
  const params = {
    TableName: DYNAMO_TABLE,
    Item: {
      ...data,
      ttl: oneWeekAfterTrainLeft,
    },
    ReturnConsumedCapacity: "TOTAL",
  };

  client.put(params, function (err, data) {
    if (err) console.log(err);
    else console.log(data);
  });
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

export const deleteItemDynamo = (id: string) =>
  client
    .delete({
      TableName: DYNAMO_TABLE,
      Key: {
        id,
      },
    })
    .promise();
