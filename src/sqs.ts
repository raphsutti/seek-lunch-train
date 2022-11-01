import { SQS } from "aws-sdk";

const client = new SQS({
  region: "ap-southeast-2",
});

export const sendSqs = (body: string) => {
  const params = {
    MessageBody: body,
    QueueUrl:
      "https://sqs.ap-southeast-2.amazonaws.com/581696986433/seek-lunch-train-dev-seekLunchTrainQueue-pr8pMsJzHcSO",
  };

  client
    .sendMessage(params, function (err, data) {
      if (err) {
        console.log("Error", err);
      } else {
        console.log("Success", data.MessageId);
      }
    })
    .promise();
};
