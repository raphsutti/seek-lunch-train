import { App, AwsLambdaReceiver } from "@slack/bolt";
import { AwsEvent } from "@slack/bolt/dist/receivers/AwsLambdaReceiver";
import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";
import {
  deleteItemDynamo,
  LunchTrainRecord,
  putDynamoItem,
  queryAllTrainsByCreator,
  queryDynamo,
} from "./dynamo";
import { format, formatISO, getUnixTime, sub } from "date-fns";
import { v4 as uuidV4 } from "uuid";
import {
  BlockAction,
  ButtonAction,
} from "@slack/bolt/dist/types/actions/block-action";
import { sendSqs } from "./sqs";

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

// TODO - use Lambda SQS event to process events

// TODO - update original created train message when train deleted or in the past

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
              initial_time: "12:00", // TODO - time should be in the future
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

  const leavingAt = zonedTimeToUtc(
    new Date(date + "T" + time + ":00"),
    "Australia/Sydney"
  );

  // Cannot create train in the past
  if (leavingAt < new Date()) {
    await client.chat.postEphemeral({
      channel,
      user: creatorId,
      text: ":tardis: The train was not created because you selected a time the past!",
    });
    return;
  }
  // Announce train created
  const postMessageResult = await client.chat.postMessage({
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
            "dd/MM/yy hh:mm aa"
          )}`,
        },
      },
      // TODO - remove buttons once train has left (leavingAt < now)
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

  // Set reminder for train creator
  const { scheduled_message_id } = await client.chat.scheduleMessage({
    channel: creatorId,
    text: `🚄 Your lunch train to ${lunchDestination} is departing in 10 minutes\n Head to your meeting point at ${meetLocation}`,
    post_at: getUnixTime(sub(leavingAt, { minutes: 10 })),
  });

  // Save train to db - sqs processor not required
  try {
    await putDynamoItem({
      creatorId,
      trainId,
      lunchDestination,
      meetLocation,
      leavingAt: leavingAt.toISOString(),
      participants: [],
      trainCreatedPostTimeStamp: postMessageResult.message?.ts ?? "",
      creatorReminderScheduledMessageId: scheduled_message_id ?? "",
    });
  } catch (error) {
    logger.error(error, "Failed to put new lunch train into Dynamo");
  }

  return;
});

// Join lunch train
app.action("joinTrain", async ({ ack, body, client, logger }) => {
  await ack();

  const buttonValue = (body as BlockAction).actions[0] as ButtonAction;
  const [creatorId, trainId] = buttonValue.value.split(".");

  const queryResult = await queryDynamo({ creatorId, trainId });
  if (!queryResult) {
    return logger.error(
      `Could not find trainId: ${trainId} created by user: ${creatorId}`
    );
  }

  const hasUserJoined = queryResult.participants.some(
    (participant) => participant.userId === body.user.id
  );
  // Could early return here but leaving it for retry
  if (hasUserJoined) {
    logger.info(`User ${body.user.id} has already joined the train`);
  }

  let scheduledMessageResult;
  // Set reminder for participant
  try {
    scheduledMessageResult = await client.chat.scheduleMessage({
      channel: body.user.id,
      text: `👋 The lunch train to ${queryResult.lunchDestination} is departing in 10 minutes\n Head to your meeting point at ${queryResult.meetLocation}`,
      post_at: getUnixTime(
        sub(new Date(queryResult.leavingAt), { minutes: 10 })
      ),
    });
  } catch (error) {
    logger.info(error, "Unable to create a scheduled message for participant");
  }

  const updatedTrain: LunchTrainRecord = {
    ...queryResult,
    participants: [
      ...queryResult.participants,
      {
        userId: body.user.id,
        reminderScheduledMessageId:
          scheduledMessageResult?.scheduled_message_id ?? "",
        readyToDepart: false,
      },
    ],
  };

  // try {
  //   await sendSqs(JSON.stringify(updatedTrain));
  // } catch (error) {
  //   logger.error(
  //     error,
  //     "Failed to update lunch train participant via send SQS message"
  //   );
  // }

  try {
    await putDynamoItem(updatedTrain);
  } catch (error) {
    logger.error(error, "Failed to update lunch train participant via dynamo");
  }

  await client.chat.postMessage({
    channel,
    thread_ts: (body as BlockAction).message?.ts,
    text: `<@${body.user.id}> joined the train!`,
  });

  return;
});

// Leave lunch train
app.action("leaveTrain", async ({ ack, body, client, logger }) => {
  await ack();

  // Query Dynamo for the train
  const buttonValue = (body as BlockAction).actions[0] as ButtonAction;
  const [creatorId, trainId] = buttonValue.value.split(".");
  const queryResult = await queryDynamo({ creatorId, trainId });
  if (!queryResult) {
    return logger.error(
      `Could not find trainId: ${trainId} created by user: ${creatorId}`
    );
  }

  const hasUserJoined = queryResult.participants.some(
    (participant) => participant.userId === body.user.id
  );
  // Could early return here but leaving it for retry
  if (!hasUserJoined) {
    logger.info(`User ${body.user.id} has already left the train`);
  }

  // Delete participant scheduled messages
  const leavingParticipants = queryResult.participants.filter(
    (participant) => participant.userId === body.user.id
  );

  try {
    await Promise.all(
      leavingParticipants.map((participant) =>
        client.chat.deleteScheduledMessage({
          channel: participant.userId,
          scheduled_message_id: participant.reminderScheduledMessageId,
        })
      )
    );
  } catch (error) {
    logger.info(error, "Failed to delete scheduled messages");
  }

  // Update db
  const updatedTrain: LunchTrainRecord = {
    ...queryResult,
    participants: queryResult.participants.filter(
      (participant) => participant.userId !== body.user.id
    ),
  };

  // try {
  //   await sendSqs(JSON.stringify(updatedTrain));
  // } catch (error) {
  //   logger.error(
  //     error,
  //     "Failed to update lunch train participant via send SQS message"
  //   );
  // }

  try {
    await putDynamoItem(updatedTrain);
  } catch (error) {
    logger.error(error, "Failed to update lunch train participant via dynamo");
  }

  // Delete user joined message in thread
  const thread = await client.conversations.replies({
    channel: body.channel?.id ?? "",
    ts: (body as BlockAction).message?.thread_ts,
  });

  const replies = thread.messages
    ?.map((message) => {
      return {
        // @ts-ignore
        user: message.blocks[0].elements?.[0].elements?.[0]?.user_id,
        ts: message.ts,
      };
    })
    // Filter out parent message
    .filter((message) => message.user);

  if (!replies) {
    return logger.info("No replies found in thread");
  }

  // Find user joined message
  const messageTsToBeDeleted = replies.find(
    (reply) => reply.user === body.user.id
  );

  if (!messageTsToBeDeleted || !messageTsToBeDeleted.ts) {
    return logger.info("No message found to be deleted");
  }

  try {
    await client.chat.delete({
      channel: body.channel?.id ?? "",
      ts: messageTsToBeDeleted.ts,
    });
  } catch (error) {
    logger.error(error, "Failed to delete joined message");
  }

  return;
});

// List all trains by creator
// TODO switch to slash command /deletelunch
app.shortcut("delete_train", async ({ ack, body, client, logger }) => {
  await ack();

  const trains = await queryAllTrainsByCreator({ creatorId: body.user.id });
  if (!trains) {
    return logger.info(`No trains found for user id: ${body.user.id}`);
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "deleteTrainView",
      title: {
        type: "plain_text",
        text: "Delete lunch train",
      },
      blocks: trains.map((train) => ({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Destination: ${train.lunchDestination}, At: ${format(
            new Date(train.leavingAt),
            "dd/MM/yy hh:mm aa"
          )}`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Delete",
            emoji: true,
          },
          style: "danger",
          value: `${train.creatorId}.${train.trainId}`,
          action_id: "deleteTrain",
        },
      })),
    },
  });
  return;
});

app.action("deleteTrain", async ({ ack, body, client, logger }) => {
  await ack();

  const buttonValue = (body as BlockAction).actions[0] as ButtonAction;
  const [creatorId, trainId] = buttonValue.value.split(".");

  // Get scheduled message ids
  let queryResult: LunchTrainRecord | undefined = undefined;
  try {
    queryResult = await queryDynamo({ creatorId, trainId });
    if (!queryResult) {
      return logger.error(
        `Could not find trainId: ${trainId} created by user: ${creatorId}`
      );
    }

    // Delete item
    await deleteItemDynamo({ creatorId, trainId });
  } catch (error) {
    return logger.info(error, "Failed to delete item from dynamo");
  }

  // Only delete scheduled reminders in the past
  if (new Date(queryResult.leavingAt) > new Date()) {
    const creatorReminderScheduledMessagePayload = {
      channel: creatorId,
      scheduled_message_id: queryResult.creatorReminderScheduledMessageId,
    };
    const participantsReminderScheduledMessagePayloads =
      queryResult.participants.map((participant) => ({
        channel: participant.userId,
        scheduled_message_id: participant.reminderScheduledMessageId,
      }));

    try {
      await Promise.all(
        [
          creatorReminderScheduledMessagePayload,
          ...participantsReminderScheduledMessagePayloads,
        ].map((payload) => client.chat.deleteScheduledMessage(payload))
      );
    } catch (error) {
      logger.info(error, "Failed to delete scheduled messages");
    }
  }

  // Update train delete view modal
  const trains = await queryAllTrainsByCreator({ creatorId: body.user.id });
  if (!trains) {
    return logger.info(`No trains found for user id: ${body.user.id}`);
  }

  await client.views.update({
    response_action: "update",
    view_id: (body as BlockAction).view?.id,
    view: {
      type: "modal",
      callback_id: "deleteTrainView",
      title: {
        type: "plain_text",
        text: "Delete lunch train",
      },
      blocks: trains.map((train) => ({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Destination: ${train.lunchDestination}, At: ${format(
            new Date(train.leavingAt),
            "dd/MM/yy hh:mm aa"
          )}`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Delete",
            emoji: true,
          },
          style: "danger",
          value: `${train.creatorId}.${train.trainId}`,
          action_id: "deleteTrain",
        },
      })),
    },
  });

  return;
});

export const handler = async (event: AwsEvent, context: any, callback: any) => {
  const receiver = await awsLambdaReceiver.start();
  return receiver(event, context, callback);
};
