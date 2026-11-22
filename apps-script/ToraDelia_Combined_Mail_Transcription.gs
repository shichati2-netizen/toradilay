/**
 * סריקת מיילים ושמירת קובצי Word לפי 9 ספרות (ת.ז) בשם הקובץ,
 * וחילוץ השם מהמייל וכתיבה לשורה חדשה ב-Google Sheets.
 * 
 * לוגיקת המערכת (מציאת ת.ז מהקובץ -> חילוץ שם מהמייל -> שמירה וכתיבה לשיטס):
 * 1. סריקת מיילים עם קבצים מצורפים שטרם עובדו.
 * 2. סינון קובצי Word בלבד (.doc, .docx, .docm).
 * 3. איתור 9 ספרות ברצף בשם קובץ ה-Word המצורף (מספר הזהות).
 * 4. חילוץ שם האדם מגוף/נושא המייל (מתבנית "בתיקייה של ...").
 * 5. שמירת קובץ ה-Word בתיקייה ב-Google Drive הקרויה לפי 9 הספרות.
 * 6. כתיבה לשורה חדשה ב-Google Sheets:
 *    - עמודה A: שם פרטי
 *    - עמודה B: שם משפחה
 *    - עמודה C: מספר זהות (9 ספרות)
 * 7. סימון תוויות ב-Gmail:
 *    - "מעובד" - קובץ ה-Word נשמר ונרשם בשיטס.
 *    - "ללא קובץ וורד" - במייל אין קובצי Word כלל (מדלג להבא).
 *    - "ללא ת.ז בשם הקובץ" - יש קובץ Word אך לא נמצאו 9 ספרות בשמו (מדלג להבא).
 */

// ==================== הגדרות ====================

const PARENT_FOLDER_ID = '1CXFm0VyVtSZIqONXJYMmIu0hJyxUqj2B';
const GMAIL_SEARCH_QUERY = 'has:attachment';
const LABEL_PROCESSED = 'מעובד';
const LABEL_NO_WORD = 'ללא קובץ וורד';
const LABEL_NO_ID = 'ללא ת.ז בשם הקובץ';
const SHEET_NAME = ''; // ריק = הגיליון הפעיל הראשון בקובץ
const SEARCH_PAGE_SIZE = 100;


// ==================== הפונקציה הראשית ====================

function processEmails() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    Logger.log('הרצה אחרת כבר פועלת.');
    return;
  }

  try {
    // 1. חיבור ל-Google Sheets
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error('לא נמצא Google Sheets מחובר. פתח את Apps Script מתוך הגיליון.');
    }

    const sheet = SHEET_NAME
      ? spreadsheet.getSheetByName(SHEET_NAME)
      : spreadsheet.getActiveSheet();

    if (!sheet) {
      throw new Error('לא נמצא גיליון כתיבה תקין ב-Sheets.');
    }

    // 2. חיבור לדרייב ותוויות Gmail
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    const labelProcessed = getOrCreateLabel(LABEL_PROCESSED);
    const labelNoWord = getOrCreateLabel(LABEL_NO_WORD);
    const labelNoId = getOrCreateLabel(LABEL_NO_ID);

    // חיפוש מיילים עם קבצים מצורפים, ללא התוויות שכבר טופלו
    const query = GMAIL_SEARCH_QUERY + 
      ' -label:"' + LABEL_PROCESSED + '"' +
      ' -label:"' + LABEL_NO_WORD + '"' +
      ' -label:"' + LABEL_NO_ID + '"';

    const threads = getAllThreads(query);

    Logger.log('שאילתת Gmail: ' + query);
    Logger.log('נמצאו ' + threads.length + ' שיחות לבדיקה.');

    let processedThreads = 0;
    let noWordThreads = 0;
    let noIdThreads = 0;
    let savedFiles = 0;
    let writtenRows = 0;
    let skippedNonWordFiles = 0;

    for (let t = 0; t < threads.length; t++) {
      const thread = threads[t];
      const messages = thread.getMessages();

      let threadHasAttachments = false;
      let threadHasWordAttachments = false;
      let filesSavedInThread = 0;
      let wordFilesMissingId = 0;

      for (let m = 0; m < messages.length; m++) {
        const message = messages[m];

        // הודעות חוזרות ממודלי התמלול מטופלות בפונקציה נפרדת,
        // כדי שלא ייכנסו בטעות למסלול הרישום הישן של קובצי Word.
        if (isTranscriptionModelSender(message.getFrom())) {
          continue;
        }

        let attachments;

        try {
          attachments = message.getAttachments({
            includeInlineImages: false,
            includeAttachments: true
          });
        } catch (error) {
          Logger.log(
            'שגיאה בקריאת קבצים במייל "' +
            message.getSubject() + '": ' + error.message
          );
          continue;
        }

        if (!attachments || attachments.length === 0) {
          continue;
        }

        threadHasAttachments = true;

        // משאירים רק קובצי Word
        const wordAttachments = attachments.filter(function (attachment) {
          return isWordAttachment(attachment);
        });

        skippedNonWordFiles += attachments.length - wordAttachments.length;

        if (wordAttachments.length === 0) {
          continue;
        }

        threadHasWordAttachments = true;

        for (let a = 0; a < wordAttachments.length; a++) {
          const wordFile = wordAttachments[a];
          const fileName = wordFile.getName() || '';

          // 1. חיפוש 9 ספרות ברצף בשם קובץ ה-Word המצורף
          const id = extractIdFromFileName(fileName);

          if (!id) {
            Logger.log('קובץ Word ללא 9 ספרות ברצף בשמו: "' + fileName + '"');
            wordFilesMissingId++;
            continue;
          }

          Logger.log('נמצא מספר זהות (9 ספרות) בשם הקובץ: ' + id);

          // 2. חילוץ השם מתוך המייל
          const rawPersonName = extractNameFromMessage(message);
          const parsedName = splitEmailNameToFirstAndLast(rawPersonName);

          Logger.log(
            'חולץ מהמייל עבור ת.ז ' + id + ': שם פרטי="' +
            parsedName.firstName + '", שם משפחה="' + parsedName.lastName + '"'
          );

          try {
            // 3. שמירת הקובץ בתיקייה בדרייב לפי 9 הספרות
            const destinationFolder = getOrCreateFolder(parentFolder, id);
            const created = saveAttachment(destinationFolder, wordFile);

            if (created) {
              savedFiles++;
              filesSavedInThread++;
            }

            // 4. כתיבה ל-Google Sheets בשורה חדשה (אם עדיין לא מופיע בגיליון)
            const wasWritten = appendToSheetIfNotExists(sheet, parsedName.firstName, parsedName.lastName, id);
            if (wasWritten) {
              writtenRows++;
            }

          } catch (err) {
            Logger.log('שגיאה בטיפול בקובץ "' + fileName + '": ' + err.message);
          }
        }
      }

      // סימון תוויות ב-Gmail לפי תוצאות השיחה:
      if (threadHasAttachments && !threadHasWordAttachments) {
        // בשיחה היו קבצים אך אף אחד מהם אינו Word
        thread.addLabel(labelNoWord);
        noWordThreads++;
        Logger.log('השיחה סומנה "ללא קובץ וורד" ותדולג בריצות הבאות.');

      } else if (threadHasWordAttachments && filesSavedInThread > 0 && wordFilesMissingId === 0) {
        // כל קובצי ה-Word זוהו, נשמרו ונרשמו בשיטס בהצלחה
        thread.addLabel(labelProcessed);
        processedThreads++;
        Logger.log('השיחה סומנה "מעובד". נשמרו ' + filesSavedInThread + ' קבצים.');

      } else if (threadHasWordAttachments && filesSavedInThread > 0 && wordFilesMissingId > 0) {
        // חלק נשמרו וחלק היו ללא 9 ספרות
        thread.addLabel(labelProcessed);
        processedThreads++;
        Logger.log('השיחה סומנה "מעובד" (נשמרו ' + filesSavedInThread + ' קבצים, ' + wordFilesMissingId + ' ללא 9 ספרות).');

      } else if (threadHasWordAttachments && wordFilesMissingId > 0 && filesSavedInThread === 0) {
        // יש קובצי Word אך באף אחד מהם אין 9 ספרות בשם
        thread.addLabel(labelNoId);
        noIdThreads++;
        Logger.log('השיחה סומנה "ללא ת.ז בשם הקובץ" ותדולג בריצות הבאות.');
      }
    }

    Logger.log('========== סיכום הריצה ==========');
    Logger.log('שיחות שסומנו כמעובדות: ' + processedThreads);
    Logger.log('שיחות ללא קובץ Word: ' + noWordThreads);
    Logger.log('שיחות עם קובץ ללא 9 ספרות: ' + noIdThreads);
    Logger.log('קובצי Word שנשמרו בדרייב: ' + savedFiles);
    Logger.log('שורות חדשות שנכתבו בשיטס: ' + writtenRows);
    Logger.log('קבצים שאינם Word ודולגו: ' + skippedNonWordFiles);

  } finally {
    lock.releaseLock();
  }
}


// ==================== חילוץ 9 ספרות משם הקובץ ====================

function extractIdFromFileName(fileName) {
  if (!fileName) {
    return null;
  }

  // חיפוש 9 ספרות ברצף
  const match = String(fileName).match(/\d{9}/);
  return match ? match[0] : null;
}


// ==================== כתיבה לגיליון Google Sheets ====================

function appendToSheetIfNotExists(sheet, firstName, lastName, id) {
  const lastRow = sheet.getLastRow();

  // אם הגיליון מכיל שורות, נוודא שתעודת הזהות לא קיימת כבר כדי למנוע שורות כפולות
  if (lastRow > 0) {
    const existingIds = sheet.getRange(1, 3, lastRow, 1).getDisplayValues(); // עמודה C = ת.ז
    for (let i = 0; i < existingIds.length; i++) {
      if (String(existingIds[i][0] || '').trim() === id) {
        Logger.log('ת.ז ' + id + ' כבר מופיעה בשיטס בשורה ' + (i + 1) + ' (לא נוספה שורה כפולה).');
        return false;
      }
    }
  }

  // הוספת שורה חדשה: A=שם פרטי, B=שם משפחה, C=תעודת זהות
  sheet.appendRow([firstName, lastName, id]);
  Logger.log('נוספה שורה חדשה לשיטס: [' + firstName + ', ' + lastName + ', ' + id + ']');
  return true;
}


// ==================== חילוץ ופיצול שם מתוך המייל ====================

function splitEmailNameToFirstAndLast(extractedName) {
  if (!extractedName) {
    return { firstName: '', lastName: '' };
  }

  const cleaned = cleanExtractedName(extractedName);
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // במייל סדר המילים הוא: שם משפחה ולאחריו שם פרטי
  const lastName = parts[0];
  const firstName = parts.slice(1).join(' ');

  return {
    firstName: firstName,
    lastName: lastName
  };
}


function extractNameFromMessage(message) {
  const sources = [
    message.getBody(),
    message.getPlainBody(),
    message.getSubject()
  ];

  for (let i = 0; i < sources.length; i++) {
    const text = htmlToText(sources[i]);

    const match = text.match(
      /בתיקייה\s+של\s+(.+?)(?=\s*(?:,|;|[.!?]|ממש\s+כמו|כמו\s+בעבודה|$))/i
    );

    if (match && match[1]) {
      const name = cleanExtractedName(match[1]);
      if (name) {
        return name;
      }
    }
  }

  return null;
}


function cleanExtractedName(value) {
  return String(value || '')
    // הסרת כותרות, תפקידים וכינויים
    .replace(/^(מר|גב'|גברת|עו"ד|עו״ד|רו"ח|רו״ח|ד"ר|ד״ר|פרופ'|פרופסור|הרב)\s+/i, '')
    // הסרת סוגריים ותוכנם
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    // הסרת מירכאות וגרשיים
    .replace(/[\"'״׳“”‘’`]/g, '')
    // מנקים סימני פיסוק שנשארו בקצוות
    .replace(/^[.,;:!?—–־\s-]+|[.,;:!?—–־\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


function htmlToText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\s*br\b[^>]*>/gi, ' ')
    .replace(/<\/(p|div|td|tr|li|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function (match, number) {
      return String.fromCharCode(Number(number));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (match, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/[\u200e\u200f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


// ==================== סינון קובצי Word ====================

function isWordAttachment(attachment) {
  const fileName = String(
    attachment.getName() || ''
  ).trim();

  // אם יש סיומת, היא חייבת להיות DOC, DOCX או DOCM
  const extension = fileName.match(/\.([^.]+)$/);

  if (extension) {
    return /\.(doc|docx|docm)$/i.test(fileName);
  }

  // כשאין סיומת, בודקים את סוג ה-MIME
  const mimeType = String(
    attachment.getContentType() || ''
  ).toLowerCase().split(';')[0].trim();

  const allowedMimeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroenabled.12'
  ];

  return allowedMimeTypes.indexOf(mimeType) !== -1;
}


// ==================== תיקיות וקבצים בדרייב ====================

function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);

  return folders.hasNext()
    ? folders.next()
    : parentFolder.createFolder(folderName);
}


function saveAttachment(folder, attachment) {
  const fileName = attachment.getName() || 'מסמך Word';

  if (!isWordAttachment(attachment)) {
    Logger.log('דילוג על קובץ שאינו Word: ' + fileName);
    return false;
  }

  const existingFiles = folder.getFilesByName(fileName);

  if (existingFiles.hasNext()) {
    Logger.log(
      'הקובץ כבר קיים בתיקייה ולא ייווצר עותק כפול: ' + fileName
    );
    return false;
  }

  folder.createFile(attachment.copyBlob()).setName(fileName);

  Logger.log(
    'נשמר קובץ Word: "' + fileName +
    '" בתיקייה ' + folder.getName()
  );

  return true;
}


// ==================== Gmail ותוויות ====================

function getAllThreads(query) {
  const allThreads = [];
  let start = 0;

  while (true) {
    const page = GmailApp.search(
      query,
      start,
      SEARCH_PAGE_SIZE
    );

    if (page.length === 0) {
      break;
    }

    allThreads.push.apply(allThreads, page);
    start += page.length;

    if (page.length < SEARCH_PAGE_SIZE) {
      break;
    }
  }

  return allThreads;
}


function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) ||
    GmailApp.createLabel(name);
}



// ============================================================================
// קליטת תוצאות תמלול של ToraDelia + API לעדכון מצב הבקשה בעמדה
// ============================================================================
//
// כתובות השולח של ארבעת המודלים מתקבלות אוטומטית מהגדרות ToraDelia
// ונשמרות ב-Script Properties בבקשת התמלול הראשונה ולאחר כל שינוי בהגדרות.
// יש לוודא שכתובת היעד שהוגדרה בתוכנה תואמת לשדה From של תשובת המודל בפועל.
//
// פרסום כ-Web App:
// 1. Deploy > New deployment > Web app.
// 2. Execute as: Me.
// 3. Who has access: Anyone (נדרש כדי שהעמדה תוכל לבדוק סטטוס לפי UUID).
// 4. להעתיק את כתובת /exec למסך הגדרות התמלול ב-ToraDelia.
// 5. להריץ פעם אחת את installTranscriptionReplyTrigger ולאשר הרשאות.

const TRANSCRIPTION_CONFIG = {
  // כתובות המודלים נשמרות אוטומטית בכל בקשת תמלול מ-ToraDelia.

  LABEL_SAVED: 'תמלול חזר - נשמר',
  LABEL_NO_ID: 'תמלול חזר - ללא תעודת זהות בשם הקובץ',
  LABEL_UNSUPPORTED: 'תמלול חזר - קובץ לא נתמך',

  ALLOWED_RESULT_EXTENSIONS: ['doc', 'docx', 'docm', 'pdf', 'txt', 'rtf']
};

const TRANSCRIPTION_STATUS_PREFIX = 'TORADELIA_TRANSCRIPTION_';
const TRANSCRIPTION_REPLY_SENDERS_PROPERTY = 'TORADELIA_TRANSCRIPTION_REPLY_SENDERS';

/** שומר את ארבע כתובות המודלים שמתקבלות מ-ToraDelia. */
function saveTranscriptionReplySenders_(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('התוכנה לא העבירה את הגדרות כתובות המודלים. יש לעדכן את ToraDelia לגרסה החדשה.');
  }

  const senders = {
    audioModel1: normalizeEmail_(input.audioModel1),
    audioModel2: normalizeEmail_(input.audioModel2),
    handwritingModel1: normalizeEmail_(input.handwritingModel1),
    handwritingModel2: normalizeEmail_(input.handwritingModel2)
  };

  const keys = Object.keys(senders);
  const invalid = keys.filter(function(key) {
    const address = senders[key];
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
      address.indexOf('@example.com') !== -1;
  });
  if (invalid.length > 0) {
    throw new Error('יש להגדיר בתוכנת ToraDelia את כל ארבע כתובות הדואר האמיתיות של המודלים לפני שליחת תמלול.');
  }

  PropertiesService.getScriptProperties().setProperty(
    TRANSCRIPTION_REPLY_SENDERS_PROPERTY,
    JSON.stringify(senders)
  );
  return senders;
}

/** קורא את כתובות המודלים שנשמרו אוטומטית מהתוכנה. */
function getTranscriptionReplySenderMap_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(TRANSCRIPTION_REPLY_SENDERS_PROPERTY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      audioModel1: normalizeEmail_(parsed.audioModel1),
      audioModel2: normalizeEmail_(parsed.audioModel2),
      handwritingModel1: normalizeEmail_(parsed.handwritingModel1),
      handwritingModel2: normalizeEmail_(parsed.handwritingModel2)
    };
  } catch (error) {
    Logger.log('הגדרות כתובות המודלים השמורות אינן תקינות.');
    return null;
  }
}


/**
 * סריקת תשובות משני מודלי התמלול.
 * שם קובץ התוצאה מנורמל לת.ז. + סיומת, ונשמר בתיקיית התלמיד בדרייב.
 * מזהה הבקשה מהנושא נשמר ב-Script Properties כדי שהעמדה תוכל לבדוק סטטוס ב-doGet.
 */
function processTranscriptionReplies() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('קליטת תמלולים: הרצה אחרת כבר פועלת.');
    return;
  }

  try {
    validateTranscriptionConfig_();
    const senderQuery = getTranscriptionReplySenders_().map(function(sender) {
      return 'from:' + sender;
    });

    const labelSaved = getOrCreateLabel(TRANSCRIPTION_CONFIG.LABEL_SAVED);
    const labelNoId = getOrCreateLabel(TRANSCRIPTION_CONFIG.LABEL_NO_ID);
    const labelUnsupported = getOrCreateLabel(TRANSCRIPTION_CONFIG.LABEL_UNSUPPORTED);
    const query =
      'has:attachment {' + senderQuery.join(' ') + '}' +
      ' -label:"' + TRANSCRIPTION_CONFIG.LABEL_SAVED + '"' +
      ' -label:"' + TRANSCRIPTION_CONFIG.LABEL_NO_ID + '"' +
      ' -label:"' + TRANSCRIPTION_CONFIG.LABEL_UNSUPPORTED + '"';

    const threads = getAllThreads(query);
    const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
    let saved = 0;
    let missingId = 0;
    let unsupported = 0;

    Logger.log('קליטת תמלולים: ' + threads.length + ' שיחות לבדיקה.');

    threads.forEach(function(thread) {
      let threadSaved = 0;
      let threadMissingId = 0;
      let threadUnsupported = 0;
      let foundModelMessage = false;
      const requestIds = {};
      const savedNamesByRequest = {};

      thread.getMessages().forEach(function(message) {
        const sender = extractEmailAddress_(message.getFrom());
        const modelType = getTranscriptionModelType_(sender);
        if (!modelType) return;

        foundModelMessage = true;
        const requestId = extractTranscriptionRequestId_(message);
        if (requestId) {
          requestIds[requestId] = true;
          savedNamesByRequest[requestId] = savedNamesByRequest[requestId] || [];
        }

        const attachments = message.getAttachments({
          includeInlineImages: false,
          includeAttachments: true
        }) || [];

        attachments.forEach(function(attachment) {
          const originalName = String(attachment.getName() || '').trim();
          const extensionMatch = originalName.match(/\.([^.]+)$/);
          const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';

          if (!extension ||
              TRANSCRIPTION_CONFIG.ALLOWED_RESULT_EXTENSIONS.indexOf(extension) === -1) {
            threadUnsupported++;
            unsupported++;
            Logger.log('תמלול: קובץ בפורמט לא נתמך (' + modelType + '): ' + originalName);
            return;
          }

          const studentId = extractIdFromFileName(originalName);
          if (!studentId) {
            threadMissingId++;
            missingId++;
            Logger.log('תמלול: לא נמצאו 9 ספרות בשם הקובץ: ' + originalName);
            return;
          }

          try {
            const requestedFolderId = extractDriveFolderIdFromMessage_(message);
            const destinationFolder = getTranscriptionDestinationFolder_(
              parentFolder,
              studentId,
              requestedFolderId
            );

            // שומרים את הסיומת המספרית, אם המודל החזיר מספר קבצים לאותו חשבון.
            const suffixMatch = originalName.match(/^\d{9}(-\d+)?\.[^.]+$/);
            const suffix = suffixMatch && suffixMatch[1] ? suffixMatch[1] : '';
            const targetName = studentId + suffix + '.' + extension;
            saveTranscriptionResult_(destinationFolder, attachment, targetName);

            if (requestId && savedNamesByRequest[requestId].indexOf(targetName) === -1) {
              savedNamesByRequest[requestId].push(targetName);
            }

            threadSaved++;
            saved++;
            Logger.log(
              'נשמר תמלול ' + modelType + ' עבור ת.ז ' + studentId +
              ' בתיקייה ' + destinationFolder.getName() + ' בשם ' + targetName
            );
          } catch (error) {
            Logger.log(
              'שגיאה בשמירת תוצאת תמלול "' + originalName + '": ' +
              (error && error.message ? error.message : error)
            );
            throw error;
          }
        });
      });

      // גם אם Gmail החזיר הודעה חוזרת בלי קובץ תקין, מעדכנים את העמדה בכישלון.
      Object.keys(requestIds).forEach(function(requestId) {
        const names = savedNamesByRequest[requestId] || [];
        if (names.length > 0 && threadMissingId === 0 && threadUnsupported === 0) {
          saveTranscriptionReplyStatus_(requestId, {
            status: 'completed',
            savedFileNames: names
          });
        } else {
          saveTranscriptionReplyStatus_(requestId, {
            status: 'failed',
            savedFileNames: names,
            error: threadMissingId > 0
              ? 'בקובץ התוצאה לא נמצאה תעודת זהות בת 9 ספרות בשם הקובץ.'
              : 'לא התקבל קובץ תוצאה בפורמט נתמך.'
          });
        }
      });

      if (!foundModelMessage) return;
      if (threadSaved > 0 && threadMissingId === 0 && threadUnsupported === 0) {
        thread.addLabel(labelSaved);
      } else if (threadMissingId > 0) {
        thread.addLabel(labelNoId);
      } else if (threadUnsupported > 0 || threadSaved === 0) {
        thread.addLabel(labelUnsupported);
      }
    });

    Logger.log('========== סיכום קליטת תמלולים ==========');
    Logger.log('קבצים שנשמרו או כבר קיימים: ' + saved);
    Logger.log('קבצים ללא ת.ז בשם: ' + missingId);
    Logger.log('קבצים בפורמט לא נתמך: ' + unsupported);
  } finally {
    lock.releaseLock();
  }
}


/**
 * doPost receives audio / handwriting files from the kiosk and sends the email
 * from the Google account that owns this Apps Script project.
 */
/**
 * נקודת כניסה משולבת:
 * - JSON action=send: מקבלת קבצים מ-ToraDelia ושולחת אותם במייל למודל.
 * - action=emails/transcriptions/all/ping: תאימות לממשק ה-Web App הישן.
 */
function doPost(e) {
  const raw = e && e.postData && e.postData.contents
    ? String(e.postData.contents)
    : '';
  let body = null;

  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (error) {
      return transcriptionJsonOutput_({ ok: false, error: 'בקשת JSON לא תקינה.' });
    }
  }

  if (body && String(body.action || '').toLowerCase() === 'send') {
    return handleTranscriptionSend_(body);
  }

  const legacyAction = body && body.action
    ? body.action
    : (e && e.parameter && e.parameter.action ? e.parameter.action : 'emails');
  return handleLegacyWebAppAction_(legacyAction);
}

function handleTranscriptionSend_(body) {
  if (!isAuthorizedTranscriptionToken_(body.token)) {
    return transcriptionJsonOutput_({ ok: false, error: 'מפתח החיבור אינו תקין.' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return transcriptionJsonOutput_({ ok: false, error: 'המערכת עסוקה. נסה שוב.' });
  }

  try {
    const requestId = String(body.requestId || '').trim().toLowerCase();
    const studentId = String(body.studentId || '').replace(/\D/g, '');
    const kind = String(body.kind || '');
    const model = String(body.model || '');
    const recipient = normalizeEmail_(body.recipient);
    const folderId = String(body.folderId || '').slice(0, 200);
    const folderName = String(body.folderName || studentId).slice(0, 160);
    const attachmentsInput = Array.isArray(body.attachments) ? body.attachments : [];

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId)) {
      return transcriptionJsonOutput_({ ok: false, error: 'מזהה בקשה לא תקין.' });
    }
    if (!/^\d{9}$/.test(studentId)) {
      return transcriptionJsonOutput_({ ok: false, error: 'מספר תעודת הזהות אינו תקין.' });
    }
    try {
      saveTranscriptionReplySenders_(body.replySenders);
    } catch (configError) {
      return transcriptionJsonOutput_({
        ok: false,
        error: configError && configError.message
          ? String(configError.message).slice(0, 500)
          : 'לא ניתן לשמור את כתובות המודלים שהגיעו מ-ToraDelia.'
      });
    }
    if (kind !== 'audio' && kind !== 'handwriting') {
      return transcriptionJsonOutput_({ ok: false, error: 'סוג התמלול אינו תקין.' });
    }
    if (model !== 'model1' && model !== 'model2') {
      return transcriptionJsonOutput_({ ok: false, error: 'המודל שנבחר אינו תקין.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return transcriptionJsonOutput_({ ok: false, error: 'כתובת היעד אינה תקינה.' });
    }
    if (attachmentsInput.length < 1 || attachmentsInput.length > 20) {
      return transcriptionJsonOutput_({ ok: false, error: 'יש לצרף בין קובץ אחד ל-20 קבצים.' });
    }

    const properties = PropertiesService.getScriptProperties();
    const sentKey = transcriptionSentKey_(requestId);
    const existing = properties.getProperty(sentKey);
    if (existing) {
      return transcriptionJsonOutput_({
        ok: true,
        duplicate: true,
        requestId: requestId,
        status: 'pending'
      });
    }

    const allowedAudio = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.opus', '.amr', '.aiff', '.aif'];
    const allowedHandwriting = ['.pdf'];
    const allowed = kind === 'audio' ? allowedAudio : allowedHandwriting;
    let totalBytes = 0;
    const attachments = attachmentsInput.map(function(item) {
      const filename = String(item && item.filename || '').trim();
      const mimeType = String(item && item.mimeType || 'application/octet-stream').slice(0, 120);
      const base64 = String(item && item.base64 || '');
      if (!new RegExp('^' + studentId + '(-[2-9][0-9]*)?\\.[A-Za-z0-9]{1,8}$').test(filename)) {
        throw new Error('שם קובץ מצורף אינו תואם למספר תעודת הזהות.');
      }
      const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
      if (allowed.indexOf(extension) === -1) {
        throw new Error('סיומת קובץ אינה מותרת לסוג התמלול שנבחר.');
      }
      if (!base64 || base64.length > 28000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error('תוכן קובץ מצורף אינו תקין או גדול מדי.');
      }
      const bytes = Utilities.base64Decode(base64);
      totalBytes += bytes.length;
      if (bytes.length <= 0 || bytes.length > 20 * 1024 * 1024 || totalBytes > 20 * 1024 * 1024) {
        throw new Error('הגודל הכולל של הקבצים חורג מ-20MB.');
      }
      return Utilities.newBlob(bytes, mimeType, filename);
    });

    const kindName = kind === 'audio' ? 'תמלול קולי' : 'תמלול כתבי יד';
    const modelName = model === 'model1' ? 'מודל 1' : 'מודל 2';
    const subject = 'ToraDelia | ' + kindName + ' | ' + studentId + ' | ' + requestId;
    const bodyText = [
      'בקשת תמלול חדשה מתוכנת ToraDelia.',
      'תעודת זהות: ' + studentId,
      'סוג: ' + kindName,
      'מודל: ' + modelName,
      'מזהה בקשה: ' + requestId,
      'תיקיית יעד ב-Google Drive: ' + folderId,
      'שם תיקיית היעד: ' + folderName,
      'הקבצים המצורפים נקראים לפי תעודת הזהות.',
      'נא להשיב למייל המקורי, לשמור את מזהה הבקשה בנושא, ולצרף תוצאות ששמן מתחיל בתעודת הזהות בת 9 הספרות.'
    ].join('\n');

    const gmailSendStartedAt = Date.now();
    Logger.log(
      'ToraDelia mail send started: request=' + requestId +
      ', fileCount=' + attachments.length +
      ', totalBytes=' + totalBytes
    );
    GmailApp.sendEmail(recipient, subject, bodyText, {
      attachments: attachments,
      name: 'ToraDelia'
    });
    Logger.log(
      'ToraDelia mail send completed: request=' + requestId +
      ', elapsedMs=' + (Date.now() - gmailSendStartedAt)
    );

    properties.setProperty(sentKey, new Date().toISOString());
    saveTranscriptionReplyStatus_(requestId, {
      status: 'pending',
      savedFileNames: [],
      error: ''
    });
    return transcriptionJsonOutput_({
      ok: true,
      requestId: requestId,
      status: 'pending',
      recipient: recipient
    });
  } catch (error) {
    return transcriptionJsonOutput_({
      ok: false,
      error: error && error.message ? String(error.message).slice(0, 500) : 'שליחת המייל נכשלה.'
    });
  } finally {
    lock.releaseLock();
  }
}




/**
 * פעולות Web App מהסקריפט הקודם נשמרות לתאימות:
 * ?action=emails | transcriptions | all | ping
 */
function handleLegacyWebAppAction_(actionValue) {
  const action = String(actionValue || 'ping').trim().toLowerCase();
  const result = {
    ok: true,
    action: action,
    timestamp: new Date().toISOString(),
    results: {},
    logs: ''
  };

  try {
    if (action === 'ping') {
      result.results.status = 'ready';
    } else if (action === 'emails') {
      processEmails();
      result.results.processEmails = 'completed';
    } else if (action === 'transcriptions') {
      processTranscriptionReplies();
      result.results.processTranscriptionReplies = 'completed';
    } else if (action === 'all') {
      processEmails();
      result.results.processEmails = 'completed';
      try {
        processTranscriptionReplies();
        result.results.processTranscriptionReplies = 'completed';
      } catch (transcriptionError) {
        result.ok = false;
        result.results.processTranscriptionReplies =
          'error: ' + (transcriptionError && transcriptionError.message
            ? transcriptionError.message
            : String(transcriptionError));
      }
    } else {
      result.ok = false;
      result.error = 'Unknown action: ' + action +
        '. Supported actions: emails, transcriptions, all, ping, status.';
    }
  } catch (error) {
    result.ok = false;
    result.error = error && error.message ? error.message : String(error);
  }

  try {
    result.logs = Logger.getLog();
  } catch (logError) {
    // Logging is best-effort only.
  }

  return transcriptionJsonOutput_(result);
}


/** Web App endpoint שבו ToraDelia בודקת אם בקשת תמלול הסתיימה. */
function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || '') : '';
  if (action !== 'status') {
    return handleLegacyWebAppAction_(action || 'ping');
  }

  const token = e && e.parameter ? String(e.parameter.token || '') : '';
  if (!isAuthorizedTranscriptionToken_(token)) {
    return transcriptionJsonOutput_({ ok: false, error: 'מפתח החיבור אינו תקין.' });
  }

  const requestId = String(e.parameter.requestId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId)) {
    return transcriptionJsonOutput_({ ok: false, status: 'failed', error: 'מזהה בקשה לא תקין.' });
  }

  const raw = PropertiesService.getScriptProperties()
    .getProperty(transcriptionStatusKey_(requestId));
  if (!raw) {
    return transcriptionJsonOutput_({ ok: true, requestId: requestId, status: 'pending' });
  }

  try {
    const status = JSON.parse(raw);
    return transcriptionJsonOutput_({
      ok: true,
      requestId: requestId,
      status: status.status === 'completed' ? 'completed' : status.status === 'failed' ? 'failed' : 'pending',
      savedFileNames: Array.isArray(status.savedFileNames) ? status.savedFileNames : [],
      error: status.error || '',
      updatedAt: status.updatedAt || ''
    });
  } catch (error) {
    return transcriptionJsonOutput_({ ok: false, status: 'pending' });
  }
}


function isAuthorizedTranscriptionToken_(supplied) {
  const properties = PropertiesService.getScriptProperties();
  // The first name is canonical. The second is accepted for compatibility
  // with the earlier setup instructions, which accidentally included a space.
  const expected =
    properties.getProperty('TORADELIA_INTEGRATION_TOKEN') ||
    properties.getProperty('TOR ADELIA_INTEGRATION_TOKEN') ||
    '';
  return Boolean(expected && supplied && String(supplied) === expected);
}


function transcriptionSentKey_(requestId) {
  return 'TORADELIA_TRANSCRIPTION_SENT_' + requestId;
}

function transcriptionJsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}


function transcriptionStatusKey_(requestId) {
  return TRANSCRIPTION_STATUS_PREFIX + requestId;
}


function saveTranscriptionReplyStatus_(requestId, value) {
  const record = {
    status: value.status,
    savedFileNames: Array.isArray(value.savedFileNames) ? value.savedFileNames.slice(0, 20) : [],
    error: String(value.error || '').slice(0, 500),
    updatedAt: new Date().toISOString()
  };
  PropertiesService.getScriptProperties()
    .setProperty(transcriptionStatusKey_(requestId), JSON.stringify(record));
}


function extractTranscriptionRequestId_(message) {
  const source = String(message.getSubject() || '') + '\n' + String(message.getPlainBody() || '');
  const match = source.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : '';
}


function extractDriveFolderIdFromMessage_(message) {
  const body = String(message.getPlainBody() || '');
  const match = body.match(/תיקיית יעד ב-Google Drive:\s*([A-Za-z0-9_-]{10,200})/i);
  return match ? match[1] : '';
}


/**
 * אם האפליקציה שלחה מזהה תיקייה, משתמשים בה רק אם היא תיקייה ישירה
 * בתוך תיקיית השורש המוגדרת. אחרת נופלים לתיקייה לפי ת.ז.
 */
function getTranscriptionDestinationFolder_(parentFolder, studentId, requestedFolderId) {
  if (requestedFolderId) {
    try {
      const candidate = DriveApp.getFolderById(requestedFolderId);
      const parents = candidate.getParents();
      while (parents.hasNext()) {
        if (parents.next().getId() === parentFolder.getId()) {
          return candidate;
        }
      }
    } catch (error) {
      Logger.log('לא ניתן להשתמש בתיקיית היעד שבבקשה; תיבחר תיקייה לפי ת.ז.');
    }
  }
  return getOrCreateFolder(parentFolder, studentId);
}


/**
 * מחזיר true אם כתובת השולח היא אחת מכתובות התשובה של המודלים.
 * משמש גם כדי להחריג את המיילים האלה מהמסלול הישן של קובצי Word.
 */
function isTranscriptionModelSender(fromValue) {
  return !!getTranscriptionModelType_(extractEmailAddress_(fromValue));
}


function getTranscriptionReplySenders_() {
  const senders = getTranscriptionReplySenderMap_();
  return senders
    ? [senders.audioModel1, senders.audioModel2, senders.handwritingModel1, senders.handwritingModel2]
        .filter(Boolean)
    : [];
}


function getTranscriptionModelType_(sender) {
  const normalized = normalizeEmail_(sender);
  if (!normalized) return null;
  const senders = getTranscriptionReplySenderMap_();
  if (!senders) return null;
  if (normalized === senders.audioModel1) return 'מודל 1 · תמלול קולי';
  if (normalized === senders.audioModel2) return 'מודל 2 · תמלול קולי';
  if (normalized === senders.handwritingModel1) return 'מודל 1 · תמלול כתבי יד';
  if (normalized === senders.handwritingModel2) return 'מודל 2 · תמלול כתבי יד';
  return null;
}

function extractEmailAddress_(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/<\s*([^<>]+@[^<>]+)\s*>/);
  if (match) return match[1].trim();
  const plain = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return plain ? plain[0].toLowerCase() : '';
}


function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}


function validateTranscriptionConfig_() {
  const senders = getTranscriptionReplySenders_();
  if (senders.length !== 4 || senders.some(function(sender) {
    return sender.indexOf('@example.com') !== -1 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender);
  })) {
    throw new Error(
      'כתובות המודלים עדיין לא התקבלו מ-ToraDelia. שלח תחילה בקשת תמלול מהגרסה המעודכנת של התוכנה.'
    );
  }
}


/**
 * שומר את הקובץ בשם תעודת הזהות + סיומת. קובץ קיים אינו נדרס.
 * מחזיר false אם כבר קיים קובץ באותו שם.
 */
function saveTranscriptionResult_(folder, attachment, targetName) {
  const existing = folder.getFilesByName(targetName);
  if (existing.hasNext()) return false;
  const blob = attachment.copyBlob().setName(targetName);
  folder.createFile(blob);
  return true;
}


/** מתקין טריגר קליטה כל 5 דקות; יש להריץ ידנית פעם אחת ולאשר הרשאות. */
function installTranscriptionReplyTrigger() {
  const handler = 'processTranscriptionReplies';
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
  Logger.log('נוצר טריגר לקליטת תוצאות תמלול כל 5 דקות.');
}


function testTranscriptionConfiguration() {
  validateTranscriptionConfig_();
  Logger.log('ארבע כתובות השולח התקבלו ונשמרו אוטומטית מ-ToraDelia.');
}
