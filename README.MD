# Lunch Train Slack Bot

## Features

- Create a lunch train (bot will remind you 10 minutes before train leaves)
- Join a lunch train as a participant (bot will remind user 10 minutes before train leaves)
- Leave a lunch train (and delete reminder)
- Delete a lunch train (and delete reminder)

## Deployment

- Create `.env` file in the root directory and add

```
SLACK_BOT_TOKEN=xxx
SLACK_SIGNING_SECRET=xxx
```

The token and secret can be obtained via [the Slack created app](https://api.slack.com/apps/A0493C2CQBC)

- `awsauth` into sandbox-deux
- run `serverless deploy --region ap-southeast-2`

Update the endpoint to the app

## Testing

- Run `ngrok http 3000` on a terminal - copy the link
- Run `serverless offline --noPrependStageInUrl` on another terminal
- Update the copied link to the app
  - [Interactivity and shortcuts](https://api.slack.com/apps/A0493C2CQBC/interactive-messages?)
  - [Slash commands](https://api.slack.com/apps/A0493C2CQBC/slash-commands?)
