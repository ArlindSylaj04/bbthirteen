import pptxgen from 'pptxgenjs';
import fs from 'node:fs';

// ── palette: built from the cockpit's own dark UI + its lime brand accent ──
const BG    = '0A101E';   // deep navy, dominant
const CARD  = '16203A';   // raised surface
const LIME  = 'A3D024';   // brand accent
const LIME2 = '6E8F12';
const RED   = 'FF2D55';   // matches the numbered markers burned into the screenshots
const TXT   = 'EEF2F8';
const MUT   = '93A3BD';
const HDR   = 'Arial';
const BODY  = 'Calibri';

const W = 13.333, H = 7.5;
const size = f => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const fit = (file, bx) => {           // contain: centre inside the box, keep aspect
  const { w, h } = size(file), r = w / h, br = bx.w / bx.h;
  const out = r > br ? { w: bx.w, h: bx.w / r } : { h: bx.h, w: bx.h * r };
  return { path: file, x: bx.x + (bx.w - out.w) / 2, y: bx.y + (bx.h - out.h) / 2, w: out.w, h: out.h };
};

const P = new pptxgen();
P.defineLayout({ name: 'WIDE', width: W, height: H });
P.layout = 'WIDE';
P.author = 'QA Test Management';
P.title  = 'QA Test Management Cockpit — Kurzanleitung';

const bg = s => s.background = { color: BG };

// step marker: lime disc + number, the deck's repeating motif
const disc = (s, x, y, n, d = 0.46, col = LIME, fg = '0A101E') => {
  s.addShape(P.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: col }, line: { color: col } });
  s.addText(String(n), { x, y, w: d, h: d, fontFace: HDR, fontSize: d > 0.6 ? 18 : 13, bold: true,
    color: fg, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
};

const slideTitle = (s, kicker, title) => {
  if (kicker) s.addText(kicker, { x: 0.62, y: 0.38, w: 11.5, h: 0.26, fontFace: BODY, fontSize: 11.5,
    bold: true, color: LIME, charSpacing: 2.2, margin: 0, isTextBox: true });
  s.addText(title, { x: 0.6, y: 0.66, w: 11.9, h: 0.62, fontFace: HDR, fontSize: 30, bold: true,
    color: TXT, margin: 0, isTextBox: true });
};

// a numbered explanation row-list that mirrors the red markers in the screenshot
const markers = (s, x, y, w, items, col = RED) => {
  let cy = y;
  items.forEach((t, i) => {
    const lines = Math.max(1, Math.ceil(t.length / Math.max(9, (w - 0.55) * 13)));
    disc(s, x, cy + 0.02, i + 1, 0.34, col, 'FFFFFF');
    s.addText(t, { x: x + 0.48, y: cy - 0.04, w: w - 0.48, h: 0.3 * lines, fontFace: BODY, fontSize: 13.5,
      color: TXT, margin: 0, valign: 'top', isTextBox: true });
    cy += 0.3 * lines + 0.16;
  });
  return cy;
};

const note = (s, text, y = 6.82) =>
  s.addText(text, { x: 0.62, y, w: 12.1, h: 0.34, fontFace: BODY, fontSize: 11.5, italic: true,
    color: MUT, margin: 0, isTextBox: true });

const shot = (s, file, box, caption) => {
  s.addShape(P.ShapeType.roundRect, { x: box.x - 0.08, y: box.y - 0.08, w: box.w + 0.16, h: box.h + 0.16,
    fill: { color: CARD }, line: { color: '2B3A5C', width: 1 }, rectRadius: 0.06 });
  s.addImage(fit(file, box));
  if (caption) s.addText(caption, { x: box.x, y: box.y + box.h + 0.12, w: box.w, h: 0.26, fontFace: BODY,
    fontSize: 10.5, color: MUT, align: 'center', margin: 0, isTextBox: true });
};

// ═══════════════════ 1 · TITLE ═══════════════════
let s = P.addSlide(); bg(s);
s.addShape(P.ShapeType.roundRect, { x: 0.8, y: 1.45, w: 0.09, h: 3.1, fill: { color: LIME }, line: { color: LIME }, rectRadius: 0.5 });
s.addText('QA · TEST MANAGEMENT COCKPIT', { x: 1.15, y: 1.5, w: 9, h: 0.3, fontFace: BODY, fontSize: 13,
  bold: true, color: LIME, charSpacing: 3, margin: 0, isTextBox: true });
s.addText('Kurzanleitung', { x: 1.12, y: 1.95, w: 10.5, h: 1.0, fontFace: HDR, fontSize: 54, bold: true,
  color: TXT, margin: 0, isTextBox: true });
s.addText('Vom Anlegen eines Releases bis zum fertigen Statusbericht —\nSchritt für Schritt, mit Bildschirmfotos.',
  { x: 1.15, y: 3.05, w: 9.6, h: 0.9, fontFace: BODY, fontSize: 18, color: MUT, lineSpacing: 26, margin: 0, isTextBox: true });
['Eine einzige HTML-Datei · offline lauffähig', 'Beispiel in dieser Anleitung: Release 26.03.00',
 'Daten bleiben im Browser — nichts wird hochgeladen'].forEach((t, i) => {
  s.addShape(P.ShapeType.roundRect, { x: 1.15 + i * 3.62, y: 4.6, w: 3.4, h: 0.62, fill: { color: CARD },
    line: { color: '2B3A5C', width: 1 }, rectRadius: 0.08 });
  s.addText(t, { x: 1.3 + i * 3.62, y: 4.6, w: 3.1, h: 0.62, fontFace: BODY, fontSize: 11.5, color: TXT,
    valign: 'middle', margin: 0, isTextBox: true });
});
s.addText('Cordes & Graefe KG · QA Test Management · vertraulich', { x: 1.15, y: 6.6, w: 10, h: 0.3,
  fontFace: BODY, fontSize: 11, color: MUT, margin: 0, isTextBox: true });
s.addNotes('Diese Anleitung führt durch den kompletten Ablauf: anmelden, Release anlegen, qTest- und Jira-Daten importieren, auswerten und exportieren.');

// ═══════════════════ 2 · ABLAUF ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'ÜBERBLICK', 'Der Ablauf in vier Schritten');
const steps = [
  ['Anmelden', 'Die Rolle bestimmt die Rechte: Viewer liest, Editor importiert, Admin verwaltet Releases.'],
  ['Release anlegen', 'Version, Zeitraum, Testumgebungen, Zeitplan je Umgebung und Verantwortliche eintragen.'],
  ['Zwei Dateien importieren', 'qTest-Export für die Testläufe, Jira-CSV für die Fehler. Beide werden automatisch verknüpft.'],
  ['Auswerten & exportieren', 'Fortschritt, Abdeckung und Fehler lesen — dann als PDF, PowerPoint oder Excel herausgeben.'],
];
steps.forEach(([t, d], i) => {
  const x = 0.62 + i * 3.08;
  s.addShape(P.ShapeType.roundRect, { x, y: 1.75, w: 2.86, h: 3.3, fill: { color: CARD },
    line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
  disc(s, x + 0.3, 2.05, i + 1, 0.62);
  s.addText(t, { x: x + 0.3, y: 2.8, w: 2.34, h: 0.66, fontFace: HDR, fontSize: 16, bold: true,
    color: TXT, valign: 'top', margin: 0, isTextBox: true });
  s.addText(d, { x: x + 0.3, y: 3.52, w: 2.34, h: 1.4, fontFace: BODY, fontSize: 12, color: MUT,
    lineSpacing: 17, valign: 'top', margin: 0, isTextBox: true });
  if (i < 3) s.addText('→', { x: x + 2.92, y: 3.15, w: 0.3, h: 0.4, fontFace: HDR, fontSize: 20,
    color: LIME2, align: 'center', margin: 0, isTextBox: true });
});
s.addShape(P.ShapeType.roundRect, { x: 0.62, y: 5.42, w: 12.1, h: 0.78, fill: { color: '1B2C1A' },
  line: { color: LIME2, width: 1 }, rectRadius: 0.07 });
s.addText('Alles im Cockpit ist release- und umgebungsbezogen. Vor dem Lesen der Zahlen immer prüfen, welches Release oben im Kopfbereich steht.',
  { x: 0.9, y: 5.42, w: 11.6, h: 0.78, fontFace: BODY, fontSize: 13.5, color: TXT, valign: 'middle', margin: 0, isTextBox: true });
s.addNotes('Die vier Schritte sind die Gliederung der ganzen Anleitung.');

// ═══════════════════ helper: standard content slide ═══════════════════
const twoCol = (kicker, title, file, items, noteTxt, imgBox) => {
  const sl = P.addSlide(); bg(sl);
  slideTitle(sl, kicker, title);
  markers(sl, 0.62, 1.72, 4.5, items);
  shot(sl, file, imgBox || { x: 5.5, y: 1.62, w: 7.25, h: 4.95 });
  if (noteTxt) note(sl, noteTxt);
  return sl;
};
const wideSlide = (kicker, title, file, items, noteTxt, imgBox) => {
  const sl = P.addSlide(); bg(sl);
  slideTitle(sl, kicker, title);
  shot(sl, file, imgBox || { x: 0.62, y: 1.58, w: 12.1, h: 3.5 });
  markers(sl, 0.62, 5.35, 12.1, items);
  if (noteTxt) note(sl, noteTxt);
  return sl;
};

// ═══════════════════ 3 · ANMELDEN ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 1 · ANMELDEN', 'Ohne Anmeldung nur Lesezugriff');
shot(s, 'shots/s01-login-button.png', { x: 0.62, y: 1.62, w: 12.1, h: 1.5 });
s.addText('Oben rechts im Kopfbereich \u2014 sichtbar, solange niemand angemeldet ist.',
  { x: 0.62, y: 3.2, w: 6.0, h: 0.3, fontFace: BODY, fontSize: 11.5, color: MUT, margin: 0, isTextBox: true });
shot(s, 'shots/s02-login-form.png', { x: 0.62, y: 3.62, w: 5.0, h: 2.8 });
markers(s, 6.0, 3.7, 6.7, [
  'Benutzer aus der Liste wählen.',
  '6-stellige PIN eingeben.',
  'Auf „Log in" klicken. Der Name und die Rolle erscheinen danach oben rechts.',
]);
s.addShape(P.ShapeType.roundRect, { x: 6.0, y: 5.3, w: 6.72, h: 1.12, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText([
  { text: 'Viewer', options: { bold: true, color: LIME } }, { text: ' — nur lesen   ·   ', options: { color: MUT } },
  { text: 'Editor', options: { bold: true, color: LIME } }, { text: ' — zusätzlich importieren   ·   ', options: { color: MUT } },
  { text: 'Admin', options: { bold: true, color: LIME } }, { text: ' — zusätzlich Releases verwalten', options: { color: MUT } },
], { x: 6.25, y: 5.3, w: 6.25, h: 1.12, fontFace: BODY, fontSize: 12.5, valign: 'middle', margin: 0, isTextBox: true });
s.addNotes('Ohne Anmeldung sind alle Import- und Verwaltungsschaltflächen ausgeblendet.');

// ═══════════════════ 4 · RELEASE-NAVIGATION ═══════════════════
twoCol('SCHRITT 2 · RELEASE ANLEGEN', 'Die Release-Leiste links',
  'shots/s03-release-nav.png', [
    'Alle Releases, das neueste immer oben. „CURRENT" markiert das laufende Release.',
    'Über „Manage Releases" werden Releases angelegt, bearbeitet, dupliziert oder gelöscht.',
  ],
  'Ein Klick auf eine Umgebung (IR1, QC1, IR3 …) springt direkt zu deren Kachel im Bericht.',
  { x: 5.5, y: 1.62, w: 7.25, h: 4.6 });

// ═══════════════════ 5 · MANAGE RELEASES ═══════════════════
wideSlide('SCHRITT 2 · RELEASE ANLEGEN', 'Release-Verwaltung öffnen',
  'shots/s04-manage-releases.png', [
    'Mit „+ New release" ein leeres Release von Grund auf anlegen.',
    'Mit „Duplicate" den Zeitplan eines bestehenden Releases in eine neue Version kopieren — schneller als alles neu einzutragen.',
  ],
  'Jedes Release behält seine eigenen Umgebungen, Termine und importierten Daten. Speichern schreibt nie in ein anderes Release.',
  { x: 0.62, y: 1.58, w: 12.1, h: 3.5 });

// ═══════════════════ 6 · KOPFDATEN ═══════════════════
twoCol('SCHRITT 2 · RELEASE ANLEGEN', 'Neues Release — Kopfdaten',
  'shots/s05-form-header.png', [
    'Version, z. B. 26.03.00 — Pflichtfeld und muss eindeutig sein.',
    'Status: Planned, In Progress, Completed oder Archived.',
    'Release-Beginn.',
    'Release-Ende.',
    '„Set as the current release" — nur setzen, wenn dieses Release ab jetzt das laufende ist.',
  ],
  'Das Feld „Release Information" ist freiwillig — Umfang, Ziele oder Hinweise für das Team.');

// ═══════════════════ 7 · VERANTWORTLICHKEITEN ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 2 · RELEASE ANLEGEN', 'Verantwortlichkeiten eintragen');
shot(s, 'shots/s06-form-responsibilities.png', { x: 0.62, y: 1.7, w: 12.1, h: 2.3 });
markers(s, 0.62, 4.35, 12.1, [
  'Rolle — über die Schaltflächen darunter: Release Management, Project Manager, Test Manager, Defect Manager oder eine eigene Rolle.',
  'Name oder Namen, durch Komma getrennt.',
  '„+ Custom role" für jede Rolle, die in der Liste fehlt.',
]);
note(s, 'Neue Releases starten bewusst leer. Beim Duplizieren werden die Verantwortlichkeiten mitkopiert.');

// ═══════════════════ 8 · UMGEBUNGEN + ZEITPLAN ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 2 · RELEASE ANLEGEN', 'Testumgebungen und Zeitplan');
shot(s, 'shots/s07-form-schedule.png', { x: 4.55, y: 1.55, w: 5.0, h: 5.15 });
markers(s, 0.62, 1.75, 3.75, [
  'Nur die Umgebungen anhaken, die dieses Release wirklich nutzt.',
  'Für jede gewählte Umgebung erscheint ein eigener Zeitplan-Block.',
  'Testzeitraum: Start und Ende.',
  'Bug-Fixing-Zeitraum, optional zusätzlich ein Retest-Zeitraum.',
]);
s.addShape(P.ShapeType.roundRect, { x: 9.85, y: 1.75, w: 2.88, h: 3.15, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText('Gut zu wissen', { x: 10.1, y: 1.95, w: 2.4, h: 0.3, fontFace: HDR, fontSize: 13.5, bold: true,
  color: LIME, margin: 0, isTextBox: true });
s.addText('• Nicht jedes Release nutzt jede Umgebung.\n\n• „Add another environment" legt eigene Umgebungen an, z. B. UAT.\n\n• Aus diesen Terminen berechnet das Cockpit Status und Countdown automatisch.',
  { x: 10.1, y: 2.35, w: 2.45, h: 2.45, fontFace: BODY, fontSize: 11.5, color: TXT, lineSpacing: 15, margin: 0, isTextBox: true });
note(s, 'Die Reihenfolge wird geprüft: ein Bug-Fixing-Ende vor seinem Beginn wird beim Speichern abgelehnt.');

// ═══════════════════ 9 · ANLEGEN + LISTE ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 2 · RELEASE ANLEGEN', 'Speichern — und das Release steht');
shot(s, 'shots/s08-create-release.png', { x: 0.62, y: 1.85, w: 4.1, h: 2.1 });
shot(s, 'shots/s09-release-list.png', { x: 5.3, y: 1.7, w: 7.42, h: 3.3 });
s.addText('„Create release" speichert. Danach erscheint das Release in der Liste und in der Leiste links.',
  { x: 0.62, y: 4.3, w: 4.1, h: 0.9, fontFace: BODY, fontSize: 13.5, color: TXT, margin: 0, isTextBox: true });
shot(s, 'shots/s10-nav-switched.png', { x: 0.62, y: 5.35, w: 12.1, h: 1.25 });
note(s, 'Ein Klick auf eine Version in der Leiste wechselt das Release. Der Kopfbereich zeigt immer, welches gerade geöffnet ist.', 6.78);

// ═══════════════════ 10 · qTEST-IMPORT ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 3 · IMPORT', 'Datei 1 — der qTest-Export');
shot(s, 'shots/s11-import-xls-button.png', { x: 0.62, y: 1.62, w: 12.1, h: 1.45 });
markers(s, 0.62, 3.35, 6.0, [
  '„Import XLS / CSV" im Kopfbereich — der qTest-Export desselben Releases, das hier angelegt wurde.',
]);
s.addShape(P.ShapeType.roundRect, { x: 0.62, y: 4.15, w: 6.0, h: 2.3, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText('Welche Spalten die Datei braucht', { x: 0.88, y: 4.32, w: 5.5, h: 0.3, fontFace: HDR,
  fontSize: 13.5, bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('Directory · Status · Name · Executed By · Executed End\nApplication · Module · Requirement · Defect IDs\nTest Run ID · Test Case ID',
  { x: 0.88, y: 4.72, w: 5.5, h: 1.5, fontFace: BODY, fontSize: 12, color: TXT, lineSpacing: 19, margin: 0, isTextBox: true });
s.addShape(P.ShapeType.roundRect, { x: 6.9, y: 3.3, w: 5.82, h: 3.15, fill: { color: '1B2C1A' },
  line: { color: LIME2, width: 1 }, rectRadius: 0.07 });
s.addText('Die Umgebung wird aus dem Directory gelesen', { x: 7.16, y: 3.5, w: 5.3, h: 0.3, fontFace: HDR,
  fontSize: 13.5, bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('Der Directory-Pfad muss die Umgebung als eigenes Segment enthalten, z. B.\n\nGC SAP Upgrade / QC1 / Finance / Team Finance\n\nDaraus ergeben sich Umgebung, Testbereich und Team. Zeilen ohne erkennbare Umgebung werden übersprungen und gemeldet.',
  { x: 7.16, y: 3.9, w: 5.3, h: 2.3, fontFace: BODY, fontSize: 12, color: TXT, lineSpacing: 17, margin: 0, isTextBox: true });

// ═══════════════════ 11 · ERGEBNIS ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 3 · IMPORT', 'Sofort nach dem Import');
shot(s, 'shots/s12-after-xls-full.png', { x: 0.62, y: 1.6, w: 12.1, h: 4.75 });
note(s, 'Fortschritt je Umgebung, Gesamtstatus, Zeitstrahl und Countdown werden sofort berechnet — ohne weitere Eingaben.', 6.55);
s.addNotes('552 geplante Testläufe, 279 bestanden, 28 fehlgeschlagen. IR1 ist abgeschlossen, QC1 läuft.');

// ═══════════════════ 12 · JIRA-IMPORT ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 3 · IMPORT', 'Datei 2 — die Fehler aus Jira');
shot(s, 'shots/s13-import-jira-button.png', { x: 0.62, y: 1.7, w: 4.6, h: 4.4 });
markers(s, 5.6, 1.85, 7.1, [
  '„Import Jira CSV" im Block „Defect Overview" auf der rechten Seite.',
]);
s.addShape(P.ShapeType.roundRect, { x: 5.6, y: 2.6, w: 7.12, h: 1.75, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText('Welche Spalten die Datei braucht', { x: 5.86, y: 2.78, w: 6.6, h: 0.3, fontFace: HDR,
  fontSize: 13.5, bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('Issue key · Summary · Status · Priority · Assignee · Reporter\nCreated · Updated · Component/s · Environment · Fix Version/s',
  { x: 5.86, y: 3.18, w: 6.6, h: 1.0, fontFace: BODY, fontSize: 12, color: TXT, lineSpacing: 19, margin: 0, isTextBox: true });
s.addShape(P.ShapeType.roundRect, { x: 5.6, y: 4.5, w: 7.12, h: 1.9, fill: { color: '1B2C1A' },
  line: { color: LIME2, width: 1 }, rectRadius: 0.07 });
s.addText('Es ist ein Import für alle Fehler', { x: 5.86, y: 4.68, w: 6.6, h: 0.3, fontFace: HDR,
  fontSize: 13.5, bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('Eine einzige Jira-CSV deckt das ganze Release ab. Als geschlossen zählen die Status „Closed" und „Ready for Transport".',
  { x: 5.86, y: 5.08, w: 6.6, h: 1.1, fontFace: BODY, fontSize: 12.5, color: TXT, lineSpacing: 18, margin: 0, isTextBox: true });

// ═══════════════════ 13 · VERKNÜPFUNG ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 3 · IMPORT', 'Fehler und Testläufe verknüpfen sich selbst');
shot(s, 'shots/s24-defect-exports.png', { x: 0.62, y: 1.6, w: 8.6, h: 4.8 });
s.addShape(P.ShapeType.roundRect, { x: 9.5, y: 1.6, w: 3.22, h: 2.35, fill: { color: '1B2C1A' },
  line: { color: LIME2, width: 1 }, rectRadius: 0.07 });
s.addText('Automatischer Abgleich', { x: 9.75, y: 1.78, w: 2.75, h: 0.3, fontFace: HDR, fontSize: 13.5,
  bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('Das Cockpit verbindet jeden Jira-Fehler mit seinem qTest-Testlauf — über die Spalte „Defect IDs", über die Test-Run-ID und über die Test-Case-ID. Die Leiste zeigt, wie viele Tickets verknüpft sind.',
  { x: 9.75, y: 2.18, w: 2.75, h: 1.7, fontFace: BODY, fontSize: 11.5, color: TXT, lineSpacing: 16, margin: 0, isTextBox: true });
s.addShape(P.ShapeType.roundRect, { x: 9.5, y: 4.15, w: 3.22, h: 2.25, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText('Filterleiste', { x: 9.75, y: 4.33, w: 2.75, h: 0.3, fontFace: HDR, fontSize: 13.5, bold: true,
  color: LIME, margin: 0, isTextBox: true });
s.addText('Suche, Priorität, Status, Bereich, Erstelldatum, Retest und Verknüpfungsart. Jeder Export übernimmt genau die gesetzten Filter.',
  { x: 9.75, y: 4.73, w: 2.75, h: 1.5, fontFace: BODY, fontSize: 11.5, color: TXT, lineSpacing: 16, margin: 0, isTextBox: true });
note(s, 'Zu jedem Fehler steht der verknüpfte Testlauf mit Anzahl der Läufe und Datum — so ist sofort sichtbar, was noch fehlschlägt.', 6.6);

// ═══════════════════ 14 · UMGEBUNGSKARTEN ═══════════════════
wideSlide('SCHRITT 4 · AUSWERTEN', 'Fortschritt je Testumgebung',
  'shots/s15-env-cards.png', [
    'Links die Zahl der geplanten Testläufe dieser Umgebung.',
    'Der Balken teilt sie auf: bestanden, fehlgeschlagen, blockiert, nicht relevant, offen. Daneben Ausführungs- und Bestehensquote sowie Test- und Bug-Fixing-Zeitraum.',
  ],
  'Die beiden kleinen Schaltflächen auf jeder Karte öffnen den Ausführungskalender und den Abdeckungsbaum.',
  { x: 0.62, y: 1.58, w: 12.1, h: 3.55 });

// ═══════════════════ 15 · PRO TEAM ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 4 · AUSWERTEN', 'Aufgeklappt: Fortschritt je Bereich und Team');
shot(s, 'shots/s17-env-testlist.png', { x: 0.62, y: 1.6, w: 12.1, h: 4.75 });
note(s, 'Ein Klick auf die Chip-Schaltfläche „4 TESTS" einer Umgebung klappt sie auf: je Testbereich die ausgeführten von den geplanten Läufen, bestanden/fehlgeschlagen/blockiert, Ausführungs- und Bestehensquote sowie das verantwortliche Team mit Ampelstatus.', 6.55);

// ═══════════════════ 16 · PRO TAG ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 4 · AUSWERTEN', 'Testläufe pro Tag — der Ausführungskalender');
shot(s, 'shots/s16-exec-calendar.png', { x: 4.2, y: 1.58, w: 5.6, h: 4.85 });
markers(s, 0.62, 1.78, 3.4, [
  'Filter nach Anwendung und nach Team — die Zahlen im Kalender folgen der Auswahl.',
  'Vorschlag, wie viele Tests pro Arbeitstag nötig sind, um rechtzeitig fertig zu werden.',
]);
s.addShape(P.ShapeType.roundRect, { x: 10.1, y: 1.78, w: 2.62, h: 3.1, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText('Was der Kalender zeigt', { x: 10.34, y: 1.96, w: 2.2, h: 0.3, fontFace: HDR, fontSize: 13,
  bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('• Ausgeführte Testläufe je Tag\n\n• Geplant, ausgeführt, offen\n\n• Verbleibende Arbeitstage\n\n• Ein Klick auf einen Tag zeigt, welche Tests an dem Tag gelaufen sind',
  { x: 10.34, y: 2.36, w: 2.2, h: 2.4, fontFace: BODY, fontSize: 11.5, color: TXT, lineSpacing: 15, margin: 0, isTextBox: true });
note(s, 'Gerechnet wird ausschließlich in Arbeitstagen — Montag bis Freitag, 07:00 bis 17:00 Uhr.', 6.6);

// ═══════════════════ 17 · ABDECKUNG ═══════════════════
wideSlide('SCHRITT 4 · AUSWERTEN', 'Anforderungsabdeckung',
  'shots/s18-requirement-coverage.png', [
    'Wie viele Anforderungen durch Tests abgedeckt sind, wie viele davon fehlerfrei bestanden und wie viele noch fehlschlagen oder blockiert sind.',
    'Darunter die abgedeckten Anforderungen je Testumgebung.',
  ],
  'Grundlage ist die Spalte „Requirement" im qTest-Export. Ohne diese Spalte bleibt der Block leer.',
  { x: 0.62, y: 1.58, w: 12.1, h: 3.55 });

// ═══════════════════ 18 · COUNTDOWN + FEHLER ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 4 · AUSWERTEN', 'Countdown und Fehlerübersicht');
shot(s, 'shots/s19-countdown.png', { x: 0.62, y: 1.75, w: 5.6, h: 2.5 });
s.addText('Countdown', { x: 0.62, y: 4.45, w: 5.6, h: 0.32, fontFace: HDR, fontSize: 15, bold: true,
  color: LIME, margin: 0, isTextBox: true });
s.addText('Zeigt die verbleibende Zeit bis zum nächsten Termin der laufenden Umgebung — gerechnet nur in Arbeitszeit, Mo–Fr 07:00–17:00 Uhr. Die Arbeitszeit ist unter „Layout" einstellbar.',
  { x: 0.62, y: 4.85, w: 5.6, h: 1.4, fontFace: BODY, fontSize: 13, color: TXT, lineSpacing: 19, margin: 0, isTextBox: true });
shot(s, 'shots/s20-defect-overview.png', { x: 6.75, y: 1.75, w: 2.9, h: 4.55 });
s.addText('Fehlerübersicht', { x: 10.0, y: 1.85, w: 2.75, h: 0.32, fontFace: HDR, fontSize: 15, bold: true,
  color: LIME, margin: 0, isTextBox: true });
s.addText('Gesamt, offen, geschlossen & Ready for Transport sowie die Verteilung nach Priorität.\n\nJede Kachel ist anklickbar und öffnet den gefilterten Arbeitsbereich.\n\nDarunter der Fehlerverlauf: erstellt gegen gelöst, je Tag.',
  { x: 10.0, y: 2.3, w: 2.72, h: 3.6, fontFace: BODY, fontSize: 12.5, color: TXT, lineSpacing: 18, margin: 0, isTextBox: true });

// ═══════════════════ 19 · DEFECT MANAGER DASHBOARD ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 4 · AUSWERTEN', 'Defect Manager Dashboard');
shot(s, 'shots/s21-defect-dashboard.png', { x: 0.62, y: 1.6, w: 12.1, h: 4.75 });
note(s, 'Über „Defect Manager Dashboard →" erreichbar: aktueller Fehlerstand des gewählten Releases und der vereinbarte Prozess — wie ein Fehler angelegt wird, welche Angaben er braucht und welche Rolle ihn wann übernimmt.', 6.55);

// ═══════════════════ 20 · EXPORT ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 5 · EXPORTIEREN', 'Bericht herausgeben');
shot(s, 'shots/s22-export-buttons.png', { x: 0.62, y: 1.62, w: 12.1, h: 1.45 });
markers(s, 0.62, 3.35, 12.1, [
  '„PDF · Environments" — Status je Testumgebung, Zeitverbrauch, alle Fehler und die seit dem letzten Bericht neu hinzugekommenen.',
  '„Overall" — Gesamtstatus des Projekts, Zeitverbrauch und alle Fehler.',
  '„Go / No-Go" — Entscheidungsvorlage für die Phasenübergabe, je Testumgebung.',
]);
s.addShape(P.ShapeType.roundRect, { x: 0.62, y: 5.35, w: 12.1, h: 0.95, fill: { color: CARD },
  line: { color: '2B3A5C', width: 1 }, rectRadius: 0.07 });
s.addText('Fehler lassen sich zusätzlich direkt als Excel, PowerPoint oder CSV ausgeben — im Arbeitsbereich „Defect Management Workspace", jeweils mit den gesetzten Filtern.',
  { x: 0.9, y: 5.35, w: 11.5, h: 0.95, fontFace: BODY, fontSize: 13, color: TXT, valign: 'middle', margin: 0, isTextBox: true });

// ═══════════════════ 21 · GO / NO-GO ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'SCHRITT 5 · EXPORTIEREN', 'Go / No-Go — je Testumgebung');
shot(s, 'shots/s23-gonogo.png', { x: 0.62, y: 1.6, w: 8.5, h: 4.8 });
markers(s, 9.4, 1.8, 3.35, [
  '„Export as PowerPoint" erzeugt die fertige Entscheidungsvorlage.',
]);
s.addText('Der Umschalter links daneben wählt die Testumgebung — für jede gewählte Umgebung wird eine eigene Vorlage erzeugt.',
  { x: 9.4, y: 2.72, w: 3.32, h: 1.0, fontFace: BODY, fontSize: 13.5, color: TXT, margin: 0, isTextBox: true });
s.addShape(P.ShapeType.roundRect, { x: 9.4, y: 3.85, w: 3.32, h: 2.55, fill: { color: '1B2C1A' },
  line: { color: LIME2, width: 1 }, rectRadius: 0.07 });
s.addText('Woraus die Empfehlung entsteht', { x: 9.65, y: 4.03, w: 2.85, h: 0.3, fontFace: HDR,
  fontSize: 13, bold: true, color: LIME, margin: 0, isTextBox: true });
s.addText('Ausführungsgrad, Bestehensquote, fehlgeschlagene und blockierte Läufe sowie offene gate-relevante Fehler — gemessen an den vereinbarten Exit-Kriterien der Phase.',
  { x: 9.65, y: 4.43, w: 2.85, h: 1.9, fontFace: BODY, fontSize: 11.5, color: TXT, lineSpacing: 16, margin: 0, isTextBox: true });
note(s, 'Die Vorlage wird bei jedem Aufruf aus den aktuell importierten Daten neu erzeugt — sie ist nie veraltet.', 6.6);

// ═══════════════════ 22 · MERKSÄTZE ═══════════════════
s = P.addSlide(); bg(s);
slideTitle(s, 'ZUM SCHLUSS', 'Fünf Dinge, die man wissen sollte');
const facts = [
  ['Release zuerst prüfen', 'Alle Zahlen gelten für das Release und die Umgebung, die oben im Kopfbereich stehen.'],
  ['Zwei Dateien genügen', 'qTest-Export für die Testläufe, Jira-CSV für die Fehler. Die Verknüpfung passiert von selbst.'],
  ['Strikte Trennung', 'Ein Import schreibt nur in das geöffnete Release. Andere Releases bleiben unberührt.'],
  ['Nur Arbeitszeit zählt', 'Countdown und Tagesvorgaben rechnen Mo–Fr, 07:00–17:00 Uhr.'],
  ['Alles bleibt lokal', 'Eine einzige HTML-Datei, offline lauffähig. Die Daten liegen im Browser, nichts wird hochgeladen.'],
];
facts.forEach(([t, d], i) => {
  const y = 1.78 + i * 0.94;
  s.addShape(P.ShapeType.roundRect, { x: 0.62, y, w: 12.1, h: 0.82, fill: { color: CARD },
    line: { color: '2B3A5C', width: 1 }, rectRadius: 0.06 });
  disc(s, 0.9, y + 0.19, i + 1, 0.44);
  s.addText(t, { x: 1.52, y: y + 0.06, w: 3.2, h: 0.7, fontFace: HDR, fontSize: 14, bold: true,
    color: TXT, valign: 'middle', margin: 0, isTextBox: true });
  s.addText(d, { x: 4.8, y: y + 0.06, w: 7.75, h: 0.7, fontFace: BODY, fontSize: 12.5, color: MUT,
    valign: 'middle', margin: 0, isTextBox: true });
});
s.addText('Fragen und Änderungswünsche an den Test Manager.', { x: 0.62, y: 6.62, w: 12.1, h: 0.3,
  fontFace: BODY, fontSize: 12, italic: true, color: MUT, margin: 0, isTextBox: true });

await P.writeFile({ fileName: 'QA_Cockpit_Kurzanleitung.pptx' });
console.log('written');
