(function (global) {
  const WORKSHOP_SESSIONS = [
    {
      id: "ws-2026-10-15-1100-roborisen",
      labelKo:
        "10월 15일(목) 11:00~12:00 [핸즈온 워크숍] 주관 | 로보라이즌 / 진행 | 안지훈",
      labelEn:
        "October 15 (Thu) 11:00~12:00 [Hands on Workshop] Organizer | Roborisen / Facilitator | Jihoon Ahn",
    },
    {
      id: "ws-2026-10-15-1330-yusri",
      labelKo: "10월 15일(목) 13:30~14:30 [핸즈온 워크숍] 진행 | Yusri bin Sairi (Tenom Innovation Center)",
      labelEn:
        "October 15 (Thu) 13:30~14:30 [Hands on Workshop] Facilitator | Yusri bin Sairi (Tenom Innovation Center)",
    },
    {
      id: "ws-2026-10-15-1600-anchal",
      labelKo: "10월 15일(목) 16:00~17:00 [핸즈온 워크숍] 진행 | Anchal Sayal (CodeAI)",
      labelEn:
        "October 15 (Thu) 16:00~17:00 [Hands on Workshop] Facilitator | Anchal Sayal (CodeAI)",
    },
    {
      id: "ws-2026-10-16-1100-codable",
      labelKo: "10월 16일(금) 11:00~12:00 [핸즈온 워크숍] 주관 | 코더블 / 진행 | 전수진",
      labelEn:
        "October 16 (Fri) 11:00~12:00 [Hands on Workshop] Organizer | Codable / Facilitator | Soojin Jun",
    },
    {
      id: "ws-2026-10-16-1330-waris",
      labelKo: "10월 16일(금) 13:30~14:30 [핸즈온 워크숍] 진행 | Waris Candra (Micro:bit)",
      labelEn:
        "October 16 (Fri) 13:30~14:30 [Hands on Workshop] Host | Waris Candra (Micro:bit)",
    },
  ];

  const WORKSHOP_SESSION_IDS = new Set(WORKSHOP_SESSIONS.map((session) => session.id));

  function getWorkshopSession(id) {
    return WORKSHOP_SESSIONS.find((session) => session.id === id);
  }

  global.WorkshopSessions = {
    WORKSHOP_SESSIONS,
    WORKSHOP_SESSION_IDS,
    getWorkshopSession,
  };
})(typeof window !== "undefined" ? window : globalThis);
