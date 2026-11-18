# ToraDelia – Gmail transcription reply integration

This is the combined Gmail Apps Script for the existing Word-attachment workflow and the new ToraDelia transcription reply workflow.

## Setup

1. Open the Apps Script project attached to the Gmail account that receives the model replies.
2. Replace the existing combined script with `ToraDelia_Combined_Mail_Transcription.gs` from this folder. Keep the original `PARENT_FOLDER_ID` and existing Gmail/Drive permissions.
3. In `TRANSCRIPTION_CONFIG`, replace `MODEL_ONE_REPLY_SENDER` and `MODEL_TWO_REPLY_SENDER` with the exact **From** addresses of the two model reply emails. These are reply sender addresses, not necessarily the same as the outgoing recipient addresses configured in ToraDelia.
4. Run `testTranscriptionConfiguration` once.
5. Run `installTranscriptionReplyTrigger` once and approve Gmail/Drive/Script Properties permissions. It checks for replies every five minutes.
6. Deploy the Apps Script as a Web App: execute as the script owner and allow access to anyone. ToraDelia uses the opaque request UUID to query `doGet?action=status&requestId=...`.
7. Copy the deployed `/exec` URL into Admin Settings → Transcription → “כתובת Web App לקבלת סטטוס תמלול”.

## What it does

- Keeps the existing non-transcription Word-email processing logic in the same script.
- Identifies a transcription request by the UUID in the original subject.
- Identifies the reply model by the sender address.
- Reads the student ID from the returned attachment filename and saves as ID + extension.
- Uses the exact student Drive folder ID from the outgoing mail when that folder is a direct child of the configured root. Otherwise, it falls back to a Drive folder named with the 9-digit ID.
- Stores the returned status in Script Properties; ToraDelia polls the Web App and clears the “pending transcription” indicator after completion.

**Local-folder limitation:** Google Apps Script runs in Google's cloud and cannot write directly to a folder on the kiosk PC. If the student record is being viewed from a local-only folder, the returned output is stored in the Google Drive student folder named by ID. Drive-backed student folders are routed to their original Drive folder.

The Web App status URL is public by design; only random UUID request IDs are accepted, and no file content or student details are returned by the status endpoint.
