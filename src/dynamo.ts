import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { v4 as uuidV4 } from "uuid";

const DYNAMO_TABLE = "seek-lunch-train";

interface Participant {
  userId: string;
  readyToDepart: boolean
}
export interface LunchTrain {
  creatorId: string;
  trainId: string;
  leavingAt: Date;
  participants: Participant[]
}


const client = new DocumentClient({ region: "ap-southeast-2" });

export const putDynamoItem = (data: LunchTrain) => {
  const oneWeekAfterLeaveEnd = data.leavingAt.setDate(data.leavingAt.getDate() + 7);
  const params = {
    TableName: DYNAMO_TABLE,
    Item: {
      ...data,
      trainId: uuidV4(),
      ttl: oneWeekAfterLeaveEnd,
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
