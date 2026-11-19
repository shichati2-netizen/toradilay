# ToraDelia – Gmail / Apps Script integration

The kiosk does not connect to SMTP. It sends selected files to this Google Apps Script Web App, and the script sends the model-request emails from the Gmail account that owns the Apps Script project. The same Web App receives and tracks model replies.

## One-time setup

1. Open the Apps Script project attached to the Gmail account that should send model-request emails and receive model replies.
2. Replace the existing combined script with \`ToraDelia_Combined_Mail_Transcription.gs\`. Keep the original \`PARENT_FOLDER_ID\` and the existing Word-email workflow.
3. In \`TRANSCRIPTION_CONFIG\`, set the four exact **From** addresses from which model replies arrive:
   - \`AUDIO_MODEL_ONE_REPLY_SENDER\`
   - \`AUDIO_MODEL_TWO_REPLY_SENDER\`
   - \`HANDWRITING_MODEL_ONE_REPLY_SENDER\`
   - \`HANDWRITING_MODEL_TWO_REPLY_SENDER\`

   These are reply sender addresses. Normally they match the four destination addresses configured in ToraDelia, but use the actual From address shown on a returned model email.
4. In Apps Script, open **Project Settings → Script Properties** and create:
   - Property: \`TORADELIA_INTEGRATION_TOKEN\`
   - Value: the same random secret (at least 32 characters) that you will save in ToraDelia's Transcription settings.
5. Run \`testTranscriptionConfiguration\` once.
6. Run \`installTranscriptionReplyTrigger\` once and approve Gmail, Drive and Script Properties permissions. It checks model replies every five minutes.
7. Deploy → New deployment → Web app. Set **Execute as: Me**. Set access to **Anyone** so the kiosk can call the endpoint; the shared token protects both send and status operations.
8. Copy the deployed \`/exec\` URL and paste it into ToraDelia → Admin → Transcription → Google Apps Script Web App. Paste the same secret token in the adjacent shared-key field.
9. Save four destination addresses in ToraDelia: audio model 1, audio model 2, handwriting model 1 and handwriting model 2.

## Email sending

- ToraDelia posts selected files as Base64 attachments to \`doPost\`.
- Apps Script validates the shared token, student ID, request UUID, file extensions and 20MB total limit.
- \`GmailApp.sendEmail\` sends the attachments from the Gmail account that owns the script.
- The request subject contains the request UUID. Keep that subject intact in the model reply.
- Returned attachments must have the student's 9-digit ID in the filename. The script saves them in the matching student Drive folder, then marks the request completed or failed.

## Separate reply senders

There are four sender settings so that audio model 1, audio model 2, handwriting model 1 and handwriting model 2 can reply from different email addresses. These are independent of the four destination addresses in the kiosk, though they will often be the same.

## Important

- The Apps Script Web App URL is used for both outgoing email submission and status polling.
- The shared token is stored locally by ToraDelia and in Apps Script Script Properties. The canonical property name is `TORADELIA_INTEGRATION_TOKEN`; the script also accepts the earlier spelling with a space (`TOR ADELIA_INTEGRATION_TOKEN`) for compatibility. Do not commit the real token into GitHub.
- If the kiosk times out, check the Apps Script execution log for `ToraDelia mail send started` and `ToraDelia mail send completed`. A timeout does not prove that Gmail failed to send; check the Gmail Sent folder before retrying.
- Local-only student folders on the kiosk PC cannot be written to by Google's cloud Apps Script. Returned files are saved in the Google Drive student folder named by ID for local-only searches. Drive-backed student folders are routed to the original Drive folder.
- The existing Word attachment processing workflow remains in this combined script.
