import { SQSEvent } from "aws-lambda";
import { LunchTrainZod, putDynamoItem } from "./dynamo";
exports.handler = async function (event: SQSEvent) {
  try {
    await Promise.all(
      event.Records.map((record) => {
        const body = LunchTrainZod.safeParse(record.body);
        if (body.success) {
          return putDynamoItem(body.data);
        }
      })
    );
  } catch (error) {
    console.log(error);
  }

  return "Successfully processed messages";
};
