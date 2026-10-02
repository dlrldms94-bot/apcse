(function (global) {
  const NETWORKING_TOPICS = [
    {
      id: 1,
      info: {
        ko: "생성형 AI, 학교 내 전면 허용해야할까?",
        en: "Should generative AI be fully permitted in schools?",
      },
      moderator: {
        ko: "생성형 AI, 학교 내 전면 허용해야 할까?",
        en: "Should generative AI be fully permitted in schools?",
      },
    },
    {
      id: 2,
      info: {
        ko: "AI 교육격차 해소, 인프라 보급 vs 교사 역량강화 무엇이 먼저인가?",
        en: "Closing the AI education gap: Which should come first—expanding infrastructure or strengthening teachers’ capabilities?",
      },
      moderator: {
        ko: "AI 교육격차 해소, 인프라 보급 vs 교사 역량 강화 무엇이 먼저인가?",
        en: "Closing the AI education gap: Which should come first—expanding infrastructure or strengthening teachers’ capabilities?",
      },
    },
    {
      id: 3,
      info: {
        ko: 'AI 교육, "With AI(활용 능력)"와 "About AI(이해, 비판 능력)" 중 무엇이 더 중요한가?',
        en: "AI education: Which is more important—“With AI” (the ability to use AI) or “About AI” (the ability to understand and critically evaluate AI)?",
      },
      moderator: {
        ko: 'AI 교육, “With AI(활용 능력)”와 “About AI(이해·비판 능력)” 중 무엇이 더 중요한가?',
        en: "AI education: Which is more important—“With AI” (the ability to use AI) or “About AI” (the ability to understand and critically evaluate AI)?",
      },
    },
    {
      id: 4,
      info: {
        ko: "AI 역량 격차는 곧 일자리, 임금 격차다? 교육이 이를 막을 수 있을까?",
        en: "Will gaps in AI competency lead to gaps in employment and wages? Can education prevent this?",
      },
      moderator: {
        ko: "AI 역량 격차는 곧 일자리·임금 격차로 이어질까? 교육이 이를 막을 수 있을까?",
        en: "Will gaps in AI competency lead to gaps in employment and wages? Can education help prevent this?",
      },
    },
    {
      id: 5,
      info: {
        ko: "AI 교육 접근성, 기기 보급 vs 콘텐츠, 언어 현지화 무엇이 먼저일까?",
        en: "Improving access to AI education: Which should come first—providing devices or localizing content and language?",
      },
      moderator: {
        ko: "AI 교육 접근성 확대, 기기 보급 vs 콘텐츠·언어 현지화 무엇이 먼저일까?",
        en: "Improving access to AI education: Which should come first—providing devices or localizing content and language?",
      },
    },
    {
      id: 6,
      info: {
        ko: "AI 교육, 설계 단계부터 UDL(보편적 학습설계)을 적용해야 한다?",
        en: "Should Universal Design for Learning (UDL) be incorporated into AI education from the design stage?",
      },
      moderator: {
        ko: "AI 교육, 설계 단계부터 UDL(보편적 학습설계)을 적용해야 할까?",
        en: "Should Universal Design for Learning (UDL) be incorporated into AI education from the design stage?",
      },
    },
  ];

  const VALID_TOPIC_IDS = new Set(NETWORKING_TOPICS.map((topic) => topic.id));

  function getTopic(id) {
    return NETWORKING_TOPICS.find((topic) => topic.id === id);
  }

  function formatModeratorTopicLabels(ids, lang) {
    const variant = lang === "en" ? "en" : "ko";
    const circled = ["①", "②", "③", "④", "⑤", "⑥"];
    return (ids || [])
      .map((rawId) => {
        const id = Number(rawId);
        const topic = getTopic(id);
        if (!topic) return null;
        const prefix = circled[id - 1] || `${id}.`;
        return `${prefix} ${topic.moderator[variant]}`;
      })
      .filter(Boolean);
  }

  function normalizeTopicIds(raw) {
    if (!Array.isArray(raw)) return [];
    const unique = [];
    for (const value of raw) {
      const id = Number(value);
      if (!VALID_TOPIC_IDS.has(id) || unique.includes(id)) continue;
      unique.push(id);
    }
    unique.sort((a, b) => a - b);
    return unique;
  }

  global.NetworkingSurveyTopics = {
    NETWORKING_TOPICS,
    VALID_TOPIC_IDS,
    getTopic,
    formatModeratorTopicLabels,
    normalizeTopicIds,
  };
})(typeof window !== "undefined" ? window : globalThis);
