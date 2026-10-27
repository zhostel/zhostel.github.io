/**
 * SALAKOT CHRISTMAS TABLE — inquiry collector (Google Apps Script)
 *
 * Saves every request from the reservation page into a Google Sheet,
 * stores proof-of-payment files in a Drive folder, and emails the team.
 *
 * SETUP (about 10 minutes)
 * 1. Create a Google Sheet, e.g. "Salakot Christmas 2026 – Inquiries".
 * 2. Extensions → Apps Script. Delete the sample code and paste this file.
 * 3. Set NOTIFY_EMAIL below. Optionally set FOLDER_NAME.
 * 4. Deploy → New deployment → type "Web app".
 *      Execute as: Me    ·    Who has access: Anyone
 *    Approve the permissions, then copy the Web app URL.
 * 5. In salakot-christmas-table.html, paste that URL into CONFIG.endpoint.
 * 6. Submit one test request from the page and check the "Inquiries" tab.
 *
 * Columns "Status", "Confirmed price/head" and "Team notes" are left for the
 * team to fill in, so the sheet doubles as your booking tracker.
 */

var NOTIFY_EMAIL = "salakot@zhostel.com";   // change to the team inbox
var FOLDER_NAME  = "Salakot Christmas 2026 – Proof of payment";
var SHEET_NAME   = "Inquiries";

var HEADERS = [
  "Submitted", "Ref", "Status", "Party date", "Days out", "Time", "Backup date",
  "Guests", "Occasion", "Space", "Menu tier",
  "Music", "Styling", "Flowers", "Lechon", "More drinks", "Host & games", "Photos", "Giveaways", "Rooms",
  "Estimate low", "Estimate high", "Per guest low", "Per guest high",
  "Downpayment pledged", "Downpayment %", "Commitment", "Pay mode", "Ref no.", "Amount sent", "Proof file",
  "Name", "Company / group", "Mobile", "Email", "Contact via",
  "Budget per guest", "Heard via", "What matters", "Notes",
  "Confirmed price/head", "Team notes", "Page"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    var sheet = getSheet_();

    var proofUrl = "";
    if (d.file && d.file.data) {
      var blob = Utilities.newBlob(Utilities.base64Decode(d.file.data), d.file.type || "application/octet-stream",
                                   d.ref + " – " + (d.file.name || "proof"));
      proofUrl = getFolder_().createFile(blob).getUrl();
    }

    var a = d.addons || {};
    sheet.appendRow([
      new Date(d.submittedAt || new Date()), d.ref, "New", d.date, d.daysOut, d.slot, d.altDate,
      d.guests, d.occasion, d.space, d.tier,
      a["Music & entertainment"], a["Table styling & arrangements"], a["Flowers"], a["Lechon"],
      a["More drinks"], a["Host, games & raffle"], a["Photos"], a["Giveaways"], a["Stay over at Z Hostel"],
      d.estimateLow, d.estimateHigh, d.perGuestLow, d.perGuestHigh,
      d.downpayment, d.downpaymentPct / 100, d.commitment, d.payMode, d.refNo, d.amountSent, proofUrl,
      d.name, d.org, "'" + d.mobile, d.email, d.contactVia,
      d.budget, d.heard, d.matters, d.notes,
      "", "", d.page
    ]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: "Christmas table request " + d.ref + " · " + d.date + " · " + d.guests + " guests · " + d.commitment,
        body: [
          d.name + (d.org ? " (" + d.org + ")" : "") + " · " + d.mobile + " · " + d.email + " · via " + d.contactVia,
          "Date: " + d.date + " (" + d.slot + ", " + d.daysOut + " days out)" + (d.altDate ? " · backup " + d.altDate : ""),
          "Guests: " + d.guests + " · " + d.occasion + " · " + d.space + " · tier " + d.tier,
          "Estimate: ₱" + d.estimateLow + "–" + d.estimateHigh + " (₱" + d.perGuestLow + "–" + d.perGuestHigh + "/guest)",
          "Downpayment: ₱" + d.downpayment + " (" + d.downpaymentPct + "%, " + d.commitment + ") · " + d.payMode +
            (d.refNo ? " · ref " + d.refNo : "") + (proofUrl ? "\nProof: " + proofUrl : ""),
          "Add-ons: " + JSON.stringify(a),
          "Matters: " + d.matters,
          "Notes: " + d.notes
        ].join("\n")
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, ref: d.ref }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
                         .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#1f3a2e").setFontColor("#ffffff");
    var status = SpreadsheetApp.newDataValidation()
      .requireValueInList(["New", "Contacted", "Quoted", "Paid – verify", "Confirmed", "Waitlist", "Lost"], true).build();
    sh.getRange(2, 3, 1000, 1).setDataValidation(status);
    sh.getRange(2, 26, 1000, 1).setNumberFormat("0%");
  }
  return sh;
}

function getFolder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
