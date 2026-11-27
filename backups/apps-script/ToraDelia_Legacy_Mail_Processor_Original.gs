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
