# ToraDelia – Gmail / Apps Script integration

The kiosk does not connect to SMTP. It sends selected files to this Google Apps Script Web App, and the script sends the model-request emails from the Gmail account that owns the Apps Script project. The same Web App receives and tracks model replies.

## One-time setup

1. Open the Apps Script project attached to the Gmail account that should send model-request emails and receive model replies.
2. Replace the existing combined script with \`ToraDelia_Combined_Mail_Transcription.gs\`. Keep the original \`PARENT_FOLDER_ID\` and the existing Word-email workflow.
3. In Apps Script, open **Project Settings → Script Properties** and create:
   - Property: `TORADELIA_INTEGRATION_TOKEN`
   - Value: the same random secret (at least 32 characters) that you will save in ToraDelia's Transcription settings.
4. Run `installTranscriptionReplyTrigger` once and approve Gmail, Drive and Script Properties permissions. It checks model replies every five minutes.
5. Deploy → **Manage deployments** → select the existing Web App → Edit → choose **New version** → Deploy. Keep **Execute as: Me** and **Who has access: Anyone**. Updating the editor code alone does not update an already deployed Web App.
6. Copy the deployed `/exec` URL and paste it into ToraDelia → Admin → Transcription → Google Apps Script Web App. Paste the same secret token in the adjacent shared-key field.
7. In ToraDelia, enter the four destination addresses (where each model request should be sent) and, separately, the four reply **From** addresses (the addresses from which result attachments will arrive).
8. On each transcription request, ToraDelia sends only the selected model's destination address in `recipient`. It separately sends the four reply-sender addresses from the dedicated settings fields.
9. Apps Script stores the reply-sender addresses in Script Properties; no email address needs to be hard-coded in the script. After the first request, run `testTranscriptionConfiguration` to verify they were received.

## Email sending

- ToraDelia sends a JSON POST with `action: send`; the selected files are included as Base64 attachments in that JSON body.
- The Web App reads the JSON from `e.postData.contents`. An older deployed script that reads only `e.parameter.action` misses the upload and may run the old `emails` scan instead of sending the audio.
- Apps Script validates the shared token, student ID, request UUID, file extensions and 20MB total limit.
- \`GmailApp.sendEmail\` sends the attachments from the Gmail account that owns the script.
- The request subject contains the request UUID. Keep that subject intact in the model reply.
- Returned attachments must have the student's 9-digit ID in the filename. The script saves them in the matching student Drive folder, then marks the request completed or failed.

## Reply sender addresses

The four reply sender addresses are entered in ToraDelia under the separate **Reply sender addresses** section. They are independent of the four destination addresses used to send requests. ToraDelia sends only the selected destination address in `recipient`, while the four reply **From** addresses are sent separately and stored by Apps Script in the `TORADELIA_TRANSCRIPTION_REPLY_SENDERS` Script Property. Enter the exact **From** address shown on an actual model reply.

## Important

- The Apps Script Web App URL is used for both outgoing email submission and status polling.
- The shared token is stored locally by ToraDelia and in Apps Script Script Properties. The canonical property name is `TORADELIA_INTEGRATION_TOKEN`; the script also accepts the earlier spelling with a space (`TOR ADELIA_INTEGRATION_TOKEN`) for compatibility. Do not commit the real token into GitHub.
- If the kiosk times out, check the Apps Script execution log for `ToraDelia mail send started` and `ToraDelia mail send completed`. A timeout does not prove that Gmail failed to send; check the Gmail Sent folder before retrying.
- Local-only student folders on the kiosk PC cannot be written to by Google's cloud Apps Script. Returned files are saved in the Google Drive student folder named by ID for local-only searches. Drive-backed student folders are routed to the original Drive folder.
- The existing Word attachment processing workflow remains in this combined script.
- Compatibility with the older Web App commands is retained: `?action=emails`, `?action=transcriptions`, `?action=all` and `?action=ping`. These do not replace the JSON `action: send` endpoint.
