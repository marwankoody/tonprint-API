/**
 * TonPrint — Contact form → Google Sheets
 * ============================================================
 * SETUP (à faire une fois dans Google) :
 *
 * 1) Crée un Google Sheet : https://sheets.google.com
 *    Nom suggéré : "TonPrint — Contact messages"
 *
 * 2) Feuille 1 renommée "Messages" avec l’en-tête ligne 1 :
 *    A: Timestamp
 *    B: Name
 *    C: Email
 *    D: Phone
 *    E: Subject
 *    F: Message
 *    G: Status
 *    H: Locale
 *    I: Source
 *    J: IP
 *
 * 3) Liste déroulante Status (colonne G) :
 *    - Sélectionne G2:G1000 (ou toute la colonne G sauf G1)
 *    - Données → Validation des données
 *    - Critères : Liste d’éléments
 *    - Valeurs : Pending,In progress,Done,Spam
 *    - Coche "Afficher la liste déroulante dans la cellule"
 *    - Enregistrer
 *
 * 4) Extensions → Apps Script
 *    - Colle TOUT ce fichier (remplace le code par défaut)
 *    - Modifie SCRIPT_SECRET ci-dessous
 *      ⚠️ DOIT être EXACTEMENT la même valeur que CONTACT_SHEETS_SECRET dans tonprint-API/.env
 *      (pas l’URL du déploiement — un secret aléatoire, ex. openssl rand -hex 24)
 *    - Enregistre (Ctrl+S)
 *
 * 5) Déployer → Nouveau déploiement
 *    - Type : Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 *    - Déployer → copie l’URL du web app (…/exec)
 *
 *    ⚠️ Après chaque modification du script : Déployer → Gérer les déploiements
 *       → crayon → Nouvelle version → Déployer (sinon l’ancien code tourne encore)
 *
 * 6) Dans tonprint-API/.env :
 *    CONTACT_SHEETS_WEBHOOK_URL=<url_du_deploiement>
 *    CONTACT_SHEETS_SECRET=<même_secret_que_SCRIPT_SECRET>
 *
 * 7) Redémarre l’API, teste /contact
 * ============================================================
 */

// ⚠️ DOIT être IDENTIQUE à CONTACT_SHEETS_SECRET dans tonprint-API/.env
// Valeur actuelle du déploiement live (change-la + redéploie pour un vrai secret) :
var SCRIPT_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET'
var SHEET_NAME = 'Messages'
var DEFAULT_STATUS = 'Pending'

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || ''
    if (!raw) {
      return jsonResponse({
        ok: false,
        message: 'Missing secret',
        hint: 'Empty POST body — redeploy script and ensure API posts text/plain JSON',
      })
    }

    var data = JSON.parse(raw)

    if (!data.secret) {
      return jsonResponse({
        ok: false,
        message: 'Missing secret',
        hint: 'Body received but no secret field',
      })
    }

    if (data.secret !== SCRIPT_SECRET) {
      return jsonResponse({
        ok: false,
        message: 'Unauthorized',
        hint: 'SCRIPT_SECRET must match CONTACT_SHEETS_SECRET, then redeploy',
      })
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    if (!sheet) {
      return jsonResponse({ ok: false, message: 'Sheet "' + SHEET_NAME + '" not found' }, 500)
    }

    // Crée l’en-tête si la feuille est vide
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'Name',
        'Email',
        'Phone',
        'Subject',
        'Message',
        'Status',
        'Locale',
        'Source',
        'IP',
      ])
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      String(data.name || '').slice(0, 100),
      String(data.email || '').slice(0, 180),
      String(data.phone || '').slice(0, 20),
      String(data.subject || '').slice(0, 60),
      String(data.message || '').slice(0, 3000),
      data.status || DEFAULT_STATUS,
      String(data.locale || 'fr').slice(0, 5),
      String(data.source || 'tonprint-web').slice(0, 40),
      String(data.ip || '').slice(0, 64),
    ])

    return jsonResponse({ ok: true })
  } catch (err) {
    return jsonResponse({ ok: false, message: String(err) }, 500)
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  )
}
