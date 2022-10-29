import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { v4 as uuidV4 } from "uuid";
import {add, formatISO, getUnixTime} from 'date-fns'

const DYNAMO_TABLE = "seek-lunch-train";

interface Participant {
  userId: string;
  readyToDepart: boolean
}
export interface LunchTrain {
  creatorId: string;
  lunchDestination: string;
  meetLocation: string;

  // UTC format
  leavingAt: string;
  participants: Participant[]
}

export interface LunchTrainRecord extends LunchTrain {
  trainId: string;
  ttl: string
}

const client = new DocumentClient({ region: "ap-southeast-2" });

export const putDynamoItem = (data: LunchTrain) => {
  const oneWeekAfterTrainLeft = getUnixTime(add(new Date(data.leavingAt), {days: 7}))
  const params = {
    TableName: DYNAMO_TABLE,
    Item: {
      ...data,
      trainId: uuidV4(),
      ttl: oneWeekAfterTrainLeft,
    },
    ReturnConsumedCapacity: "TOTAL",
  };

  client.put(params, function (err, data) {
    if (err) console.log(err);
    else console.log(data);
  });
};

// TODO use query Dynamo instead
export const scanDynamo = () =>
  client.scan({ TableName: DYNAMO_TABLE }).promise();

export const deleteItemDynamo = (id: string) =>
  client
    .delete({
      TableName: DYNAMO_TABLE,
      Key: {
        id,
      },
    })
    .promise();
