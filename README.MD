# Lunch Train Slack Bot

## Features

-

## Deployment

- Create `.env` file in the root directory and add

```
SLACK_BOT_TOKEN=xxx
SLACK_SIGNING_SECRET=xxx
```

The token and secret can be obtained via [the app](https://api.slack.com/apps/A03NB3LBFRV)

- `aws auth` into sandbox-deux
- run `serverless deploy --region ap-southeast-2`

## Testing

- Run `ngrok http 3000` on a terminal - copy the link
- Run `serverless offline --noPrependStageInUrl` on another terminal
- Update the copied link to the app
  - [Interactivity and shortcuts](https://api.slack.com/apps/A03NB3LBFRV/interactive-messages?)
  - [Slash commands](https://api.slack.com/apps/A03NB3LBFRV/slash-commands?)
  - [Event subscriptions](https://api.slack.com/apps/A03NB3LBFRV/event-subscriptions?)
