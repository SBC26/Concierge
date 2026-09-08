// Swiss Baan Chiang – seed data (editable later from the admin/back-office view)
export const DEFAULT_ROOMS = ["101", "102", "204", "305", "412"];

export const DEFAULT_STATE = {
  content: {
    wifiSsid: "SwissBaanChiang-Guest",
    wifiPassword: "Chiang1988",
    breakfastHours: "06:30 – 10:30",
    restaurantHours: "12:00 – 14:30 / 18:00 – 22:00",
    spaHours: "09:00 – 20:00",
    checkin: "14:00",
    checkout: "11:00",
    receptionPhone: "+41 44 000 00 00",
    welcome: {
      de: "Willkommen im Swiss Baan Chiang – wo Schweizer Gastfreundschaft auf thailändische Herzlichkeit trifft. Wir freuen uns, Sie verwöhnen zu dürfen.",
      en: "Welcome to Swiss Baan Chiang – where Swiss hospitality meets Thai warmth. We're delighted to have you with us.",
      th: "ยินดีต้อนรับสู่สวิส บ้านเชียง สถานที่ที่การต้อนรับแบบสวิสผสานความอบอุ่นแบบไทย เรายินดีที่ได้ดูแลท่าน",
    },
    rules: {
      de: [
        "Rauchen ist ausschliesslich auf dem Balkon gestattet.",
        "Ruhezeit von 22:00 bis 07:00 Uhr.",
        "Haustiere nach Rücksprache mit der Rezeption willkommen.",
        "Zimmerschlüssel bitte beim Auschecken an der Rezeption abgeben.",
      ],
      en: [
        "Smoking is only permitted on the balcony.",
        "Quiet hours from 10:00 PM to 7:00 AM.",
        "Pets welcome after checking with reception.",
        "Please return your room key to reception at check-out.",
      ],
      th: [
        "อนุญาตให้สูบบุหรี่เฉพาะที่ระเบียงเท่านั้น",
        "ช่วงเวลาเงียบสงบ 22:00 – 07:00 น.",
        "อนุญาตให้นำสัตว์เลี้ยงเข้าพักได้หลังแจ้งแผนกต้อนรับ",
        "กรุณาคืนกุญแจห้องพักที่แผนกต้อนรับเมื่อเช็คเอาต์",
      ],
    },
    localTips: [
      {
        icon: "landmark",
        title: { de: "Altstadt-Spaziergang", en: "Old town walk", th: "เดินชมเมืองเก่า" },
        desc: {
          de: "10 Gehminuten – historische Gassen und kleine Boutiquen.",
          en: "10 min walk – historic lanes and small boutiques.",
          th: "เดิน 10 นาที ชมตรอกซอยประวัติศาสตร์และร้านบูติกเล็กๆ",
        },
      },
      {
        icon: "mountain",
        title: { de: "Aussichtspunkt Panorama", en: "Panorama viewpoint", th: "จุดชมวิวพาโนรามา" },
        desc: {
          de: "15 Min. mit dem Taxi – bester Sonnenuntergang der Region.",
          en: "15 min by taxi – the region's best sunset.",
          th: "นั่งแท็กซี่ 15 นาที ชมพระอาทิตย์ตกที่สวยที่สุดในย่านนี้",
        },
      },
      {
        icon: "shoppingBag",
        title: { de: "Nachtmarkt", en: "Night market", th: "ตลาดนัดกลางคืน" },
        desc: {
          de: "Täglich ab 18 Uhr – lokale Küche & Handwerk.",
          en: "Daily from 6 PM – local food & crafts.",
          th: "เปิดทุกวันตั้งแต่ 18:00 น. อาหารพื้นเมืองและงานหัตถกรรม",
        },
      },
    ],
  },

  menu: [
    { id: "m1", category: "breakfast", price: 18, name: { de: "Schweizer Birchermüesli", en: "Swiss Bircher muesli", th: "เบียร์เชอร์มูสลี่สไตล์สวิส" }, desc: { de: "Hafer, Apfel, Nüsse, Joghurt", en: "Oats, apple, nuts, yoghurt", th: "ข้าวโอ๊ต แอปเปิล ถั่ว โยเกิร์ต" } },
    { id: "m2", category: "breakfast", price: 14, name: { de: "Khai Jeow (Thai-Omelette)", en: "Khai jeow (Thai omelette)", th: "ไข่เจียว" }, desc: { de: "Mit Jasminreis", en: "Served with jasmine rice", th: "เสิร์ฟพร้อมข้าวหอมมะลิ" } },
    { id: "m3", category: "mains", price: 26, name: { de: "Rösti mit Alpkäse", en: "Rösti with alpine cheese", th: "เรอชติชีสภูเขาสวิส" }, desc: { de: "Klassisch nach Berner Art", en: "Classic Bernese style", th: "สไตล์คลาสสิกแบบเบิร์น" } },
    { id: "m4", category: "thai", price: 24, name: { de: "Pad Thai Goong", en: "Pad Thai Goong", th: "ผัดไทยกุ้ง" }, desc: { de: "Gebratene Reisnudeln mit Garnelen", en: "Stir-fried rice noodles with prawns", th: "เส้นจันท์ผัดกับกุ้งสด" } },
    { id: "m5", category: "thai", price: 25, name: { de: "Gaeng Keow Wan Gai", en: "Green curry with chicken", th: "แกงเขียวหวานไก่" }, desc: { de: "Grünes Curry, Kokosmilch, Thai-Basilikum", en: "Green curry, coconut milk, Thai basil", th: "แกงเขียวหวานกะทิใบโหระพา" } },
    { id: "m6", category: "mains", price: 32, name: { de: "Zürcher Geschnetzeltes", en: "Zurich-style veal", th: "เนื้อลูกวัวตุ๋นสไตล์ซูริก" }, desc: { de: "Mit Rahmsauce und Rösti", en: "Creamy sauce with rösti", th: "ซอสครีมเสิร์ฟพร้อมเรอชติ" } },
    { id: "m7", category: "drinks", price: 6, name: { de: "Thai Eistee", en: "Thai iced tea", th: "ชาเย็น" }, desc: { de: "", en: "", th: "" } },
    { id: "m8", category: "drinks", price: 8, name: { de: "Rivella / Softdrinks", en: "Rivella / soft drinks", th: "น้ำอัดลม" }, desc: { de: "", en: "", th: "" } },
    { id: "m9", category: "drinks", price: 12, name: { de: "Hausgemachte Limonade", en: "Homemade lemonade", th: "น้ำมะนาวโซดา" }, desc: { de: "Mit Minze und Ingwer", en: "With mint and ginger", th: "ผสมมินต์และขิง" } },
    { id: "m10", category: "mains", price: 22, name: { de: "Club Sandwich", en: "Club sandwich", th: "คลับแซนด์วิช" }, desc: { de: "Pommes frites inklusive", en: "Served with fries", th: "เสิร์ฟพร้อมเฟรนช์ฟรายส์" } },
  ],
  menuCategories: [
    { id: "breakfast", label: { de: "Frühstück", en: "Breakfast", th: "อาหารเช้า" } },
    { id: "mains", label: { de: "Hauptspeisen", en: "Mains", th: "อาหารจานหลัก" } },
    { id: "thai", label: { de: "Thai-Spezialitäten", en: "Thai specialties", th: "อาหารไทย" } },
    { id: "drinks", label: { de: "Getränke", en: "Drinks", th: "เครื่องดื่ม" } },
  ],

  housekeepingOptions: [
    { id: "h1", icon: "droplets", name: { de: "Handtücher wechseln", en: "Fresh towels", th: "เปลี่ยนผ้าเช็ดตัว" } },
    { id: "h2", icon: "bed", name: { de: "Bettwäsche wechseln", en: "Fresh bed linen", th: "เปลี่ยนผ้าปูที่นอน" } },
    { id: "h3", icon: "brushCleaning", name: { de: "Zimmer jetzt reinigen", en: "Clean room now", th: "ทำความสะอาดห้องตอนนี้" } },
    { id: "h4", icon: "moon", name: { de: "Bitte nicht stören", en: "Do not disturb", th: "งดรบกวน" } },
    { id: "h5", icon: "shirt", name: { de: "Wäscheservice abholen", en: "Laundry pickup", th: "รับผ้าซักรีด" } },
    { id: "h6", icon: "sparkles", name: { de: "Extra Kissen / Decke", en: "Extra pillow / blanket", th: "หมอน/ผ้าห่มเพิ่ม" } },
  ],

  spaServices: [
    { id: "s1", name: { de: "Thai-Massage klassisch", en: "Classic Thai massage", th: "นวดแผนไทย" }, duration: 60, price: 65 },
    { id: "s2", name: { de: "Ölmassage & Aromatherapie", en: "Oil & aromatherapy massage", th: "นวดน้ำมันอโรมา" }, duration: 90, price: 95 },
    { id: "s3", name: { de: "Alpenkräuter-Bad", en: "Alpine herbal bath", th: "แช่สมุนไพรอัลไพน์" }, duration: 45, price: 55 },
    { id: "s4", name: { de: "Fussreflexzonen-Massage", en: "Foot reflexology", th: "นวดฝ่าเท้า" }, duration: 30, price: 40 },
  ],
  spaSlots: ["09:00", "10:00", "11:30", "14:00", "15:30", "17:00", "18:30"],

  taxiOptions: [
    { id: "t1", name: { de: "Flughafentransfer", en: "Airport transfer", th: "รถรับส่งสนามบิน" } },
    { id: "t2", name: { de: "Stadtfahrt", en: "City ride", th: "เดินทางในเมือง" } },
    { id: "t3", name: { de: "Bahnhof-Transfer", en: "Train station transfer", th: "รถรับส่งสถานีรถไฟ" } },
  ],
  excursions: [
    { id: "e1", price: 45, name: { de: "Halbtägige Bergwanderung", en: "Half-day mountain hike", th: "ทริปเดินป่าครึ่งวัน" }, desc: { de: "Inkl. Bergführer und Picknick", en: "Incl. mountain guide and picnic", th: "รวมไกด์นำทางและปิกนิก" } },
    { id: "e2", price: 30, name: { de: "Kulinarische Altstadttour", en: "Culinary old town tour", th: "ทัวร์ชิมอาหารเมืองเก่า" }, desc: { de: "3 Stunden, 5 Verkostungsstopps", en: "3 hours, 5 tasting stops", th: "3 ชั่วโมง แวะชิม 5 จุด" } },
    { id: "e3", price: 60, name: { de: "Sonnenuntergangs-Bootstour", en: "Sunset boat tour", th: "ล่องเรือชมพระอาทิตย์ตก" }, desc: { de: "2 Stunden inkl. Getränk", en: "2 hours incl. a drink", th: "2 ชั่วโมง พร้อมเครื่องดื่ม" } },
  ],

  postcards: [],
};
