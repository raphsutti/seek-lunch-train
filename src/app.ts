import { App, AwsLambdaReceiver, BlockAction } from "@slack/bolt";
import { AwsEvent } from "@slack/bolt/dist/receivers/AwsLambdaReceiver";
import {format, formatInTimeZone} from "date-fns-tz";
import {putDynamoItem} from "./dynamo";
import {formatISO} from "date-fns";

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

// TODO - Change this to prod channel ID
const channel = "lunch-train";

// TODO - create train
// TODO - join train
// TODO - leave train
// TODO - delete train
// TODO - set reminder when train leaving

// Create new lunch train
app.command("/lunch", async ({ ack, body, client, logger }) => {
  await ack();

  const today = formatInTimeZone(
      new Date(),
      "Australia/Melbourne",
      "yyyy-MM-dd"
  );

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
            "type": "input",
            "block_id":"lunchDestination",
            "element": {
              "type": "plain_text_input",
              "action_id": "lunchDestinationAction"
            },
            "label": {
              "type": "plain_text",
              "text": "Where are we eating?",
              "emoji": true
            }
          },
          {
            "type": "input",
            "block_id":"meetLocation",
            "element": {
              "type": "plain_text_input",
              "action_id": "meetLocationAction"
            },
            "label": {
              "type": "plain_text",
              "text": "Where shall we meet and when?",
              "emoji": true
            }
          },
          {
            "type": "input",
            "block_id":"meetDate",
            "element": {
              "type": "datepicker",
              "initial_date": today,
              "placeholder": {
                "type": "plain_text",
                "text": "Select a date",
                "emoji": true
              },
              "action_id": "meetDateAction"
            },
            "label": {
              "type": "plain_text",
              "text": "Date",
              "emoji": true
            }
          },
          {
            "type": "input",
            "block_id":"meetTime",
            "element": {
              "type": "timepicker",
              "initial_time": "12:00",
              "placeholder": {
                "type": "plain_text",
                "text": "Select time",
                "emoji": true
              },
              "action_id": "meetTimeAction"
            },
            "label": {
              "type": "plain_text",
              "text": "Time",
              "emoji": true
            }
          }

        ],
        submit: {
          type: "plain_text",
          text: "Submit",
        },
      },
    });
  } catch (error) {
    logger.error(error, "Failed to open input create train modal");
  }
  return;
})

app.action("meetDateAction", async ({ ack, body, client }) => {
  return await ack();
});

app.action("meetTimeAction", async ({ ack, body, client }) => {
  return await ack();
});

app.view("newTrain", async ({ ack, body, client, view, logger }) => {
  await ack();

//   TODO combine time and date into UTC string
const time = body.view.state.values.meetTime.meetTimeAction.selected_time
const date = body.view.state.values.meetDate.meetDateAction.selected_date
  // console.log(JSON.stringify(body,null,2))
  try {

    await putDynamoItem({
      creatorId: body.user.id,
      lunchDestination: body.view.state.values.lunchDestination.lunchDestinationAction.value ?? '',
      meetLocation: body.view.state.values.meetLocation.meetLocationAction.value ?? '',
      leavingAt: formatISO(new Date()),
      participants: []
    })

    // TODO Insert into DB
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
