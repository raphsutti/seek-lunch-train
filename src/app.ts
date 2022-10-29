import { App, AwsLambdaReceiver, BlockAction } from "@slack/bolt";
import { AwsEvent } from "@slack/bolt/dist/receivers/AwsLambdaReceiver";

if (!process.env.SLACK_SIGNING_SECRET) {
  throw Error("No SLACK_SIGNING_SECRET");
}

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const channel = "lunch-train";

// TODO - create train
// TODO - join train
// TODO - leave train
// TODO - delete train
// TODO - set reminder when train leaving

// Create new train
app.command("/lunch", async ({ ack, body, client, logger }) => {
  await ack();

  try {
    // TODO Add food destination and meeting point
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "newTrain",
        title: {
          type: "plain_text",
          text: "New train entry",
        },
        blocks: [
          {
            type: "section",
            block_id: "leavingDateTime",
            text: {
              type: "mrkdwn",
              text: "Leaving at",
            },
            accessory: {
              type: "datepicker",
              action_id: "assignTrainLeaveDateTime",
              initial_date: '2020-01-01',
              placeholder: {
                type: "plain_text",
                text: "Select a date",
              },
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Submit",
        },
      },
    });
  } catch (error) {
    logger.error(error, "Failed to open input train create modal");
  }
  return;
});

app.action("assignTrainLeaveDateTime", async ({ ack, body, client }) => {
  return await ack();
});

app.view("newTrain", async ({ ack, body, client, view, logger }) => {
  await ack();

  try {

    // TODO Insert into DB
    console.log('here')

    await client.chat.postMessage({
      channel,
      text:"done!",
    });
  } catch (error) {
    logger.error(error, "Failed to put new lunch train to Dynamo");
  }
  return;
});

export const handler = async (event: AwsEvent, context: any, callback: any) => {
  const receiver = await awsLambdaReceiver.start();
  return receiver(event, context, callback);
};
