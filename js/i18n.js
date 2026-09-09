// Swiss Baan Chiang – UI translations (guest-facing interface strings)
export const LANGS = ["de", "en", "th"];

export const LANG_LABELS = { de: "Deutsch", en: "English", th: "ไทย" };

export const UI = {
  hotelName: { de: "Swiss Baan Chiang", en: "Swiss Baan Chiang", th: "สวิส บ้านเชียง" },
  brandLabel: { de: "Villa Concierge", en: "Villa Concierge", th: "วิลล่า คอนเซียร์จ" },
  room: { de: "Villa", en: "Villa", th: "วิลล่า" },
  close: { de: "Schliessen", en: "Close", th: "ปิด" },
  back: { de: "Zurück", en: "Back", th: "กลับ" },

  // ---------- Start / Dashboard ----------
  greetingBody: {
    de: "Schön, dass du kommst. Sag uns, was du brauchst — wir richten alles vor deiner Ankunft ein.",
    en: "So glad you're coming. Tell us what you need — we'll have it ready before you arrive.",
    th: "ยินดีที่ท่านจะมาเยือน แจ้งความต้องการของท่าน เราจะจัดเตรียมให้พร้อมก่อนท่านมาถึง",
  },
  bookingLabel: { de: "Deine Buchung", en: "Your booking", th: "การจองของท่าน" },
  detailsLink: { de: "Details", en: "Details", th: "รายละเอียด" },
  servicesLabel: { de: "Services", en: "Services", th: "บริการ" },
  fromPricePrefix: { de: "ab", en: "from", th: "เริ่มต้น" },
  perDayUnit: { de: "Tag", en: "day", th: "วัน" },
  servicesUnit: { de: "ab-Preise in CHF", en: "from-prices in CHF", th: "ราคาเริ่มต้น (CHF)" },
  inclusiveLabel: { de: "inklusive", en: "included", th: "รวมในราคา" },
  secNavRules: { de: "Hausregeln & WLAN", en: "House Rules & WiFi", th: "กฎของบ้านและไวไฟ" },
  secNavSurroundings: { de: "Umgebung & Empfehlungen", en: "Surroundings & Tips", th: "รอบบริเวณและคำแนะนำ" },
  secNavRequests: { de: "Meine Anfragen", en: "My Requests", th: "คำขอของฉัน" },
  openCountSuffix: { de: "offen", en: "open", th: "รอดำเนินการ" },
  contactTitle: { de: "Direkt schreiben", en: "Message us directly", th: "ส่งข้อความถึงเราโดยตรง" },
  contactRoleLabel: { de: "dein Concierge", en: "your concierge", th: "คอนเซียร์จของท่าน" },
  contactHours: { de: "8–20 Uhr", en: "8am–8pm", th: "8:00–20:00 น." },

  // ---------- Service detail ----------
  serviceSectionLabel: { de: "Service", en: "Service", th: "บริการ" },
  addToBasketBtn: { de: "In den Anfragekorb", en: "Add to request basket", th: "เพิ่มลงตะกร้าคำขอ" },
  basketDisclaimer: {
    de: "Noch keine Buchung. Wir bestätigen innerhalb von 12 Stunden.",
    en: "Not booked yet. We confirm within 12 hours.",
    th: "ยังไม่ใช่การจอง เราจะยืนยันภายใน 12 ชั่วโมง",
  },
  laterBtn: { de: "Später", en: "Later", th: "ไว้ทีหลัง" },

  // ---------- Anfragekorb ----------
  basketSectionLabel: { de: "Anfragekorb", en: "Request basket", th: "ตะกร้าคำขอ" },
  basketTitle: { de: "Dein Anfragekorb", en: "Your request basket", th: "ตะกร้าคำขอของท่าน" },
  basketIntro: {
    de: "Prüf die Angaben, dann schicken wir alles in einer Anfrage an {name}.",
    en: "Check the details, then we'll send it all to {name} in one request.",
    th: "ตรวจสอบรายละเอียด แล้วเราจะส่งทั้งหมดเป็นคำขอเดียวถึง {name}",
  },
  basketEmpty: { de: "Dein Anfragekorb ist noch leer.", en: "Your request basket is still empty.", th: "ตะกร้าคำขอของท่านยังว่างอยู่" },
  changeLink: { de: "Ändern", en: "Change", th: "แก้ไข" },
  removeLink: { de: "Entfernen", en: "Remove", th: "ลบ" },
  addMoreRow: { de: "Weiteren Service hinzufügen", en: "Add another service", th: "เพิ่มบริการอื่น" },
  richtwertLabel: { de: "Richtwert", en: "Estimate", th: "ราคาโดยประมาณ" },
  richtwertFinePrint: {
    de: "Endgültige Preise stehen in der Bestätigung. Bezahlt wird vor Ort oder auf Rechnung.",
    en: "Final prices appear in the confirmation. Payment on-site or by invoice.",
    th: "ราคาสุดท้ายจะแจ้งในการยืนยัน ชำระเงินที่วิลล่าหรือทางใบแจ้งหนี้",
  },
  messageLabel: { de: "Nachricht an den Concierge", en: "Message to the concierge", th: "ข้อความถึงคอนเซียร์จ" },
  messagePlaceholder: { de: "Optional — alles, was wir sonst wissen sollten.", en: "Optional — anything else we should know.", th: "ไม่บังคับ — สิ่งอื่นที่อยากแจ้งให้เราทราบ" },
  sendRequestBtn: { de: "Anfrage senden", en: "Send request", th: "ส่งคำขอ" },

  // ---------- Confirmation ----------
  confirmedTitle: { de: "Angekommen", en: "Received", th: "ได้รับแล้ว" },
  confirmedBody: {
    de: "{name} hat deine {count} Wünsche erhalten und bestätigt sie innerhalb von 12 Stunden. Du bekommst eine E-Mail und siehst den Status hier im Portal.",
    en: "{name} has received your {count} requests and will confirm within 12 hours. You'll get an email and can see the status here in the portal.",
    th: "{name} ได้รับคำขอทั้ง {count} รายการของท่านแล้ว และจะยืนยันภายใน 12 ชั่วโมง ท่านจะได้รับอีเมลและดูสถานะได้ที่พอร์ทัลนี้",
  },
  confirmedBodySingular: {
    de: "{name} hat deinen Wunsch erhalten und bestätigt ihn innerhalb von 12 Stunden. Du bekommst eine E-Mail und siehst den Status hier im Portal.",
    en: "{name} has received your request and will confirm within 12 hours. You'll get an email and can see the status here in the portal.",
    th: "{name} ได้รับคำขอของท่านแล้ว และจะยืนยันภายใน 12 ชั่วโมง ท่านจะได้รับอีเมลและดูสถานะได้ที่พอร์ทัลนี้",
  },
  requestLabelPrefix: { de: "Anfrage", en: "Request", th: "คำขอ" },
  statusAnsehenBtn: { de: "Status ansehen", en: "View status", th: "ดูสถานะ" },
  backToOverviewBtn: { de: "Zurück zur Übersicht", en: "Back to overview", th: "กลับสู่หน้าหลัก" },

  // ---------- Meine Anfragen ----------
  myRequestsTitle: { de: "Status", en: "Status", th: "สถานะ" },
  statusInPruefung: { de: "In Prüfung", en: "In review", th: "กำลังตรวจสอบ" },
  statusBestaetigt: { de: "Bestätigt", en: "Confirmed", th: "ยืนยันแล้ว" },
  statusErledigt: { de: "Erledigt", en: "Done", th: "เสร็จสิ้น" },
  myRequestsEmpty: { de: "Du hast noch keine Anfragen gestellt.", en: "You haven't sent any requests yet.", th: "ท่านยังไม่มีคำขอ" },
  myRequestsClosing: {
    de: "Etwas stimmt nicht? Schreib {name} direkt. Er antwortet meist innerhalb einer Stunde.",
    en: "Something not right? Message {name} directly — usually a reply within the hour.",
    th: "มีอะไรผิดพลาดหรือไม่? ส่งข้อความถึง {name} ได้โดยตรง มักตอบกลับภายในหนึ่งชั่วโมง",
  },

  // ---------- Buchungsdetails ----------
  bookingDetailsSectionLabel: { de: "Buchung", en: "Booking", th: "การจอง" },
  villaLabel: { de: "Villa", en: "Villa", th: "วิลล่า" },
  arrivalLabel: { de: "Anreise", en: "Arrival", th: "วันเข้าพัก" },
  departureLabel: { de: "Abreise", en: "Departure", th: "วันออก" },
  guestsLabel: { de: "Gäste", en: "Guests", th: "จำนวนแขก" },
  cleaningLabel: { de: "Reinigung", en: "Cleaning", th: "ทำความสะอาด" },
  depositLabel: { de: "Kaution", en: "Deposit", th: "เงินมัดจำ" },
  addressLabel: { de: "Adresse", en: "Address", th: "ที่อยู่" },
  openMapsLink: { de: "In Karten öffnen", en: "Open in Maps", th: "เปิดในแผนที่" },
  copyAddressLink: { de: "Adresse kopieren", en: "Copy address", th: "คัดลอกที่อยู่" },
  arrivalNavLabel: { de: "Ankunft & Anfahrt", en: "Arrival & directions", th: "การเดินทางมาถึง" },
  invoiceNavLabel: { de: "Rechnung ansehen", en: "View invoice", th: "ดูใบแจ้งหนี้" },
  comingSoonToast: { de: "Diese Funktion folgt in Kürze.", en: "This feature is coming soon.", th: "ฟีเจอร์นี้จะเปิดให้ใช้งานเร็วๆ นี้" },
  adultsUnit: { de: "Erwachsene", en: "adults", th: "ผู้ใหญ่" },
  childrenUnit: { de: "Kinder", en: "children", th: "เด็ก" },

  // ---------- Hausregeln & WLAN ----------
  houseRulesTitle: { de: "Hausregeln & WLAN", en: "House Rules & WiFi", th: "กฎของบ้านและไวไฟ" },
  wlanLabel: { de: "WLAN", en: "WiFi", th: "ไวไฟ" },
  networkLabel: { de: "Netzwerk", en: "Network", th: "เครือข่าย" },
  passwordLabel: { de: "Passwort", en: "Password", th: "รหัสผ่าน" },
  copyPasswordBtn: { de: "Passwort kopieren", en: "Copy password", th: "คัดลอกรหัสผ่าน" },
  copiedToast: { de: "Kopiert", en: "Copied", th: "คัดลอกแล้ว" },
  emergencyLabel: { de: "Im Notfall", en: "In an emergency", th: "กรณีฉุกเฉิน" },
  emergencyNumberLabel: { de: "Notruf", en: "Emergency", th: "โทรฉุกเฉิน" },

  // ---------- Umgebung ----------
  surroundingsTitle: { de: "Was wir selbst mögen", en: "What we love ourselves", th: "สิ่งที่เราชื่นชอบ" },
  surroundingsIntro: {
    de: "Keine Top-10-Liste. Orte, an denen wir wirklich essen und schwimmen.",
    en: "Not a top-10 list. Places we actually eat and swim.",
    th: "ไม่ใช่ลิสต์ 10 อันดับ แต่เป็นสถานที่ที่เราไปกินและว่ายน้ำจริงๆ",
  },
  filterAll: { de: "Alle", en: "All", th: "ทั้งหมด" },

  postcardIncomingTitle: { de: "Eine Postkarte für dich", en: "A postcard for you", th: "โปสการ์ดถึงท่าน" },
  postcardFrom: { de: "Mit herzlichen Grüssen aus dem", en: "Warm regards from", th: "ด้วยความปรารถนาดีจาก" },
  postcardThanks: { de: "Vielen Dank", en: "Thank you", th: "ขอบคุณค่ะ/ครับ" },
};

export function t(key, lang) {
  const entry = UI[key];
  if (!entry) return key;
  return entry[lang] || entry.de || key;
}

// Like t(), but replaces {placeholders} with values from `vars`.
export function tv(key, lang, vars = {}) {
  let str = t(key, lang);
  for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
  return str;
}

export function tf(field, lang) {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[lang] || field.de || field.en || "";
}
