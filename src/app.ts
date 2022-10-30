import { App, AwsLambdaReceiver } from "@slack/bolt";
import { AwsEvent } from "@slack/bolt/dist/receivers/AwsLambdaReceiver";
import { formatInTimeZone } from "date-fns-tz";
import { LunchTrainRecord, putDynamoItem, queryDynamo } from "./dynamo";
import { format, formatISO } from "date-fns";
import { v4 as uuidV4 } from "uuid";
import {
  BlockAction,
  ButtonAction,
} from "@slack/bolt/dist/types/actions/block-action";

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
            type: "input",
            block_id: "lunchDestination",
            element: {
              type: "plain_text_input",
              action_id: "lunchDestinationAction",
            },
            label: {
              type: "plain_text",
              text: "Where are we eating?",
              emoji: true,
            },
          },
          {
            type: "input",
            block_id: "meetLocation",
            element: {
              type: "plain_text_input",
              action_id: "meetLocationAction",
            },
            label: {
              type: "plain_text",
              text: "Where shall we meet and when?",
              emoji: true,
            },
          },
          {
            type: "input",
            block_id: "meetDate",
            element: {
              type: "datepicker",
              initial_date: today,
              placeholder: {
                type: "plain_text",
                text: "Select a date",
                emoji: true,
              },
              action_id: "meetDateAction",
            },
            label: {
              type: "plain_text",
              text: "Date",
              emoji: true,
            },
          },
          {
            type: "input",
            block_id: "meetTime",
            element: {
              type: "timepicker",
              initial_time: "12:00",
              placeholder: {
                type: "plain_text",
                text: "Select time",
                emoji: true,
              },
              action_id: "meetTimeAction",
            },
            label: {
              type: "plain_text",
              text: "Time",
              emoji: true,
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
    logger.error(error, "Failed to open input create train modal");
  }
  return;
});

app.action("meetDateAction", async ({ ack }) => {
  return await ack();
});

app.action("meetTimeAction", async ({ ack }) => {
  return await ack();
});

// Create new train
app.view("newTrain", async ({ ack, body, client, logger }) => {
  await ack();

  const creatorId = body.user.id;
  const trainId = uuidV4();
  const lunchDestination =
    body.view.state.values.lunchDestination.lunchDestinationAction.value ?? "";
  const meetLocation =
    body.view.state.values.meetLocation.meetLocationAction.value ?? "";
  const time =
    body.view.state.values.meetTime.meetTimeAction.selected_time ?? "";
  const date =
    body.view.state.values.meetDate.meetDateAction.selected_date ?? "";
  const leavingAt = new Date(date + "T" + time + ":00");

  try {
    await putDynamoItem({
      creatorId,
      trainId,
      lunchDestination,
      meetLocation,
      leavingAt: formatISO(leavingAt),
      participants: [],
    });
  } catch (error) {
    logger.error(error, "Failed to put new lunch train to Dynamo");
  }

  await client.chat.postMessage({
    channel,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<@${
            body.user.id
          }> has started a lunch train!\nDestination: ${lunchDestination}\nMeeting at: ${meetLocation}\nLeaving: ${format(
            leavingAt,
            "MM/dd/yy hh:mm"
          )}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Count me in!",
              emoji: true,
            },
            style: "primary",
            value: `${creatorId}.${trainId}`,
            action_id: "joinTrain",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "I'll pass",
              emoji: true,
            },
            value: `${creatorId}.${trainId}`,
            action_id: "leaveTrain",
          },
        ],
      },
    ],
  });
  return;
});

// Join lunch train
app.action("joinTrain", async ({ ack, body, client, logger }) => {
  await ack();

  const buttonValue = (body as BlockAction).actions[0] as ButtonAction;
  const [creatorId, trainId] = buttonValue.value.split(".");
  console.log("creatorId: ", creatorId);
  console.log("trainId: ", trainId);
  const queryResult = await queryDynamo({ creatorId, trainId });
  if (!queryResult) {
    return logger.error(
      `Could not find trainId: ${trainId} created by user: ${creatorId}`
    );
  }

  const hasUserJoined = queryResult.participants.some(
    (participant) => participant.userId === body.user.id
  );
  if (hasUserJoined) {
    return logger.info(`User ${body.user.id} has already joined the train`);
  }

  const updatedTrain: LunchTrainRecord = {
    ...queryResult,
    participants: [
      ...queryResult.participants,
      { userId: body.user.id, readyToDepart: false },
    ],
  };

  try {
    await putDynamoItem(updatedTrain);
  } catch (error) {
    logger.error(error, "Failed to update lunch train participant to Dynamo");
  }

  await client.chat.postMessage({
    channel,
    thread_ts: (body as BlockAction).message?.ts,
    text: `<@${body.user.id}> joined the train!`,
  });

  return;
});

// TODO remove use from participants list
app.action("leaveTrain", async ({ ack }) => {
  return await ack();
});

export const handler = async (event: AwsEvent, context: any, callback: any) => {
  const receiver = await awsLambdaReceiver.start();
  return receiver(event, context, callback);
};
