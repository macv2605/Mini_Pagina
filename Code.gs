// ============================================================
// GOOGLE APPS SCRIPT UNIFICADO
// QR EDIFICIO + LINKVAULT
// ============================================================
// Conserva los datos del proyecto QR y agrega un endpoint para LinkVault.
// Para LinkVault se crean automáticamente dos carpetas en Mi unidad:
//   LinkVault - URLs generadas
//   LinkVault - TXT cargados
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: "19JGCD1MvWJX6G68AEOQtkRpEvn_ZMa3JqXVZMyyZMPk",
  SHEET_NAME: "Registros",
  FOLDER_ID: "1dA0SgmIAcRlxEX0R7lGvd_Xj6ey8IW3i",
  DESTINATARIO: "whitewolf.soporte@gmail.com",
  LINKVAULT_GENERATED_FOLDER: "LinkVault - URLs generadas",
  LINKVAULT_UPLOADS_FOLDER: "LinkVault - TXT cargados"
};

function doGet() {
  return ContentService.createTextOutput("Sistema QR + LinkVault activo.");
}

function doPost(e) {
  try {
    const p = e.parameter || {};
    if (p.action === "linkvault_upload") {
      return handleLinkVault_(p);
    }
    return handleQrVisit_(p);
  } catch (error) {
    console.error(error);
    return json_({ok:false, error:String(error)});
  }
}

function handleLinkVault_(p) {
  if (!p.fileBase64 || !p.fileName || !p.generatedBase64 || !p.generatedFileName) {
    return json_({ok:false, error:"Faltan datos de LinkVault."});
  }

  const generatedFolder = getOrCreateFolder_(CONFIG.LINKVAULT_GENERATED_FOLDER);
  const uploadsFolder = getOrCreateFolder_(CONFIG.LINKVAULT_UPLOADS_FOLDER);

  // 1) Guardar una copia del TXT original cargado.
  const fileBytes = Utilities.base64Decode(p.fileBase64);
  const originalName = safeFileName_(p.fileName, "archivo.txt");
  const uploadName = uniqueFileName_(uploadsFolder, originalName);
  const uploadBlob = Utilities.newBlob(fileBytes, p.fileMime || "text/plain", uploadName);
  const uploadedFile = uploadsFolder.createFile(uploadBlob);

  // 2) Actualizar/crear el TXT diario con todas las URLs actuales.
  const generatedBytes = Utilities.base64Decode(p.generatedBase64);
  const generatedName = safeFileName_(p.generatedFileName, "URLs.txt");
  const generatedBlob = Utilities.newBlob(generatedBytes, p.generatedMime || "text/plain", generatedName);
  const existing = generatedFolder.getFilesByName(generatedName);
  let generatedFile;

  if (existing.hasNext()) {
    generatedFile = existing.next();
    generatedFile.setContent(Utilities.newBlob(generatedBytes).getDataAsString('UTF-8'));
  } else {
    generatedFile = generatedFolder.createFile(generatedBlob);
  }

  return json_({
    ok: true,
    uploadedFileId: uploadedFile.getId(),
    uploadedFileUrl: uploadedFile.getUrl(),
    generatedFileId: generatedFile.getId(),
    generatedFileUrl: generatedFile.getUrl()
  });
}

function getOrCreateFolder_(name) {
  const root = DriveApp.getRootFolder();
  const folders = root.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(name);
}

function safeFileName_(name, fallback) {
  const cleaned = String(name || "").trim().replace(/[\\/:*?"<>|#%{}~&]/g, "_");
  return cleaned || fallback;
}

function uniqueFileName_(folder, originalName) {
  const existing = folder.getFilesByName(originalName);
  if (!existing.hasNext()) return originalName;
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot) : '.txt';
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss_SSS");
  return base + "_" + stamp + ext;
}

// ============================================================
// LÓGICA ORIGINAL QR EDIFICIO
// ============================================================
function handleQrVisit_(p) {
  const piso = clean_(p.piso);
  const tipo = clean_(p.tipo);
  const nombre = clean_(p.nombre);
  const mensaje = clean_(p.mensaje);

  if (!piso || !tipo || !nombre || !p.fotoBase64) {
    return json_({ok:false, error:"Faltan datos obligatorios."});
  }

  const ahora = new Date();
  const bytes = Utilities.base64Decode(p.fotoBase64);
  const mime = p.fotoMime || "image/jpeg";
  const extension = mime === "image/png" ? "png" : "jpg";
  const original = (p.fotoNombre || "foto").replace(/[^a-zA-Z0-9._-]/g,"_");
  const nombreArchivo = "Piso_" + piso + "_" + tipo.replace(/[^a-zA-Z0-9_-]/g,"_") + "_" + Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + "_" + original.replace(/\.[^.]+$/ ,"") + "." + extension;
  const blob = Utilities.newBlob(bytes, mime, nombreArchivo);
  const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  const file = folder.createFile(blob);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(["Fecha y hora","Piso","Personal","Nombre","Mensaje","Archivo","ID archivo"]);
  }
  sheet.appendRow([ahora,piso,tipo,nombre,mensaje,file.getUrl(),file.getId()]);

  const asunto = "Nueva visita - Piso " + piso + " - " + tipo;
  const cuerpo = "NUEVO REGISTRO DE VISITA\n\n" +
    "Piso: " + piso + "\n" +
    "Personal: " + tipo + "\n" +
    "Nombre: " + nombre + "\n" +
    "Fecha: " + Utilities.formatDate(ahora, Session.getScriptTimeZone(), "dd/MM/yyyy") + "\n" +
    "Hora: " + Utilities.formatDate(ahora, Session.getScriptTimeZone(), "HH:mm:ss") + "\n\n" +
    "Mensaje:\n" + mensaje + "\n\n" +
    "Fotografía guardada en Google Drive:\n" + file.getUrl();

  MailApp.sendEmail({to:CONFIG.DESTINATARIO, subject:asunto, body:cuerpo, attachments:[file.getBlob()], name:"Registro de visitas del edificio"});
  return json_({ok:true,id:file.getId()});
}

function clean_(value) { return String(value || "").trim(); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
